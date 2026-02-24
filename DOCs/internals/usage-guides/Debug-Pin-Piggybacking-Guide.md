# Debug Pin Piggybacking Guide: Sharing TX/RX Pins with User Serial I/O

This guide explains exactly how the P2 debugger uses the TX and RX pins, what state they are in between debug events, and whether user code can piggyback serial I/O on those same pins while debug is active.

For debug configuration reference, see [DEBUG-MASK-Usage-Guide.md](DEBUG-MASK-Usage-Guide.md). For debug strategy and the 255-record limit, see [Debug-Strategy-Guide.md](Debug-Strategy-Guide.md).

---

## The Question

When compiling with `-d` (debug enabled), the debugger uses two pins (default TX=62, RX=63) for serial communication with the host. Between debug events, those pins sit idle. Can user code transmit or receive data on those same pins during the idle windows?

---

## How the Debugger Uses the Pins

The debugger's pin usage follows a strict lifecycle with four phases. Understanding this lifecycle is essential to evaluating any piggybacking strategy.

### Phase 1: Initial Setup (Before App Launches)

The debugger setup code runs once on cog 0 at boot, before the application starts:

**TX pin** — configured as async serial TX, driven HIGH (serial idle state):

```pasm
wrpin   #%01_11110_0, _txpin_    ' Async serial TX smart pin mode
```

**RX pin** — this is the surprise — **not** configured as serial RX. Instead, it's used as a **storage register** to hold the clock frequency:

```pasm
wrpin   #%00_00001_0, _rxpin_    ' "Repository" smart pin mode (mode 1)
dirh    _rxpin_                   ' Enable the smart pin
wxpin   _clkfreq_, _rxpin_        ' Store clock frequency in the pin's X register
```

The debugger stashes `clkfreq` in the RX pin's smart pin register so it can retrieve the value later from any cog, without needing a fixed hub address.

**Lock[15]** is permanently reserved by the debugger. It's allocated at boot and never returned:

```pasm
rep     #1, #16          ' Allocate locks 0-15
locknew t
mov     t, #14           ' Return locks 0-14, keeping lock[15]
.return lockret t
djnf    t, #.return
```

Lock[15] serves as a **mutex protecting both the register save buffer and the TX/RX pins**. Every debug ISR must acquire it before touching the pins.

Then `coginit #0, #$00000` relaunches cog 0 to start the application.

### Phase 2: Debug Interrupt Entry

When a `debug()` statement executes, the interpreter runs a `brk` instruction which fires the debug ISR on that cog. The ISR does the following:

**1. Acquire lock[15]** — the ISR **spin-waits** until it gets exclusive access:

```pasm
.wait   locktry #15     wc    ' "we own the save buffer and tx/rx pins"
if_nc   jmp     #.wait
```

This serializes debug access across all eight cogs. Only one cog at a time can use the debug pins.

**2. Read clkfreq from the RX pin repository:**

```pasm
rqpin   freq, _rxpin_         ' Read stored clock frequency
```

**3. Compute the baud rate divisor from scratch** — full integer division of `clkfreq / baud`, computing clocks-per-bit for the smart pin UART configuration.

**4. Configure TX pin for serial output:**

```pasm
fltl    _txpin_               ' Reset pin (clear DIR and OUT)
wrpin   #%01_11110_0, _txpin_ ' Async serial TX mode
wxpin   txrx, _txpin_         ' Set computed baud rate
drvl    _txpin_               ' Enable — pin is now actively driving
```

**5. Configure RX pin for serial input** (destroying the repository mode):

```pasm
fltl    _rxpin_               ' Reset — repository mode is gone
wrpin   #%00_11111_0, _rxpin_ ' Async serial RX mode
wxpin   txrx, _rxpin_         ' Set computed baud rate
drvl    _rxpin_               ' Enable — pin is now receiving
```

**6. Do debug communication** — transmit debug message data, receive host commands during breakpoints (PC_KEY, PC_MOUSE, register read/write commands).

### Phase 3: Debug Done (Teardown)

After all debug output is complete, the debugger tears down the serial link:

```pasm
debug_done
        rdpin   t1, _txpin_  wc  ' Wait for TX buffer to fully drain
if_c    jmp     #debug_done

        wrpin   #%00_00001_0, _rxpin_  ' Restore RX to repository mode
        wxpin   freq, _rxpin_          ' Write clkfreq back to repository

        fltl    _txpin_                ' Float TX pin — high-impedance
        fltl    _rxpin_                ' Float RX pin — high-impedance
```

Then the cog's registers are restored and **lock[15] is released**:

```pasm
debug_exit
        setq    #$1F7-$010         ' Restore registers
        rdlong  $010, regh

        lockrel #15                ' Release the mutex
```

### Phase 4: Between Debug Events (Normal App Execution)

This is the idle window where piggybacking would occur.

**Pin state:**

| Pin | Smart Pin Mode | DIR | State | Stored Data |
|-----|---------------|-----|-------|-------------|
| TX | `%01_11110_0` (async serial TX) | Cleared | **Floating** (high-Z) | None needed |
| RX | `%00_00001_0` (repository) | Cleared | **Floating** (high-Z) | clkfreq in Z register |

**Lock[15]:** Released and available.

**Key detail:** `fltl` clears DIR but does **not** clear the smart pin mode register or its stored data. The clkfreq value persists in the RX pin's Z register and remains readable via `rqpin` even with DIR=0. This is what allows the debugger to read it on the next interrupt.

### Additional: clkfreq Maintenance

The Spin2 interpreter contains three instructions that update the RX pin repository whenever `CLKSET` changes the clock frequency:

```pasm
_debugnop1_   dirh    #<rxpin>       ' Enable RX pin
_debugnop2_   wxpin   z, #<rxpin>    ' Write new clkfreq to repository
_debugnop3_   dirl    #<rxpin>       ' Disable RX pin again
```

In non-debug builds, these are NOP'd out by the compiler. In debug builds, they're patched with the actual RX pin number. This ensures the repository always has the current clkfreq, even if the application changes the clock dynamically.

---

## The Deadlock Problem

Any piggybacking strategy that uses lock[15] must contend with a fundamental deadlock risk.

The debug ISR spin-waits on lock[15] **inside an interrupt handler**:

```pasm
.wait   locktry #15     wc
if_nc   jmp     #.wait          ' Loops forever until lock is acquired
```

If your user code on cog N holds lock[15] and a `debug()` statement triggers a `brk` on **the same cog N**, the following happens:

1. Your code is suspended mid-execution (interrupted by `brk`)
2. The ISR runs and tries `locktry #15` — fails because your suspended code holds it
3. The ISR loops forever waiting for the lock
4. Your code can never resume to release the lock
5. **Cog N is permanently deadlocked**

Since all cogs share lock[15], a deadlock on one cog eventually blocks debug on every cog — any cog that hits a `debug()` will stall waiting for the lock that will never be released.

This is the central constraint for every approach below.

---

## Piggybacking Approaches

### Approach 1: Dedicated Non-Debug Cog (Recommended)

**Eliminates the deadlock entirely** by running user serial I/O on a cog that cannot receive debug interrupts.

#### How it works

Clear one cog's bit in `DEBUG_COGS` so it never gets a debug ISR. That cog can safely acquire lock[15] without deadlock risk, because no `brk` will ever interrupt it.

```spin2
CON
  DEBUG_COGS = %01111111        ' Cog 7 has no debug capability
```

Cog 7's PASM code:

```pasm
' -------------------------------------------------------
' Running on cog 7 — no debug ISR can fire on this cog
' -------------------------------------------------------

' Acquire exclusive access to the debug pins
.lock   locktry #15       wc
if_nc   jmp     #.lock            ' Safe — no BRK can interrupt us

' Read clkfreq from RX repository (we'll need it to restore later)
        rqpin   saved_freq, _rxpin_

' Configure TX pin for our serial output
        fltl    _txpin_
        wrpin   #%01_11110_0, _txpin_
        wxpin   my_baud_config, _txpin_
        drvl    _txpin_

' ... transmit data ...
        wypin   my_byte, _txpin_
.txwait rdpin   t, _txpin_    wc
if_c    jmp     #.txwait

' Restore pins to the state the debugger expects
        fltl    _txpin_           ' Float TX

        wrpin   #%00_00001_0, _rxpin_  ' Restore RX to repository mode
        dirh    _rxpin_
        wxpin   saved_freq, _rxpin_    ' Write clkfreq back
        dirl    _rxpin_

' Release the lock — other cogs' debug ISRs can proceed
        lockrel #15
```

#### Impact on debug

While cog 7 holds lock[15], any debug ISR on cogs 0-6 will stall at `locktry #15`. Debug messages are **delayed, not lost** — the ISR will proceed as soon as the lock is released. Keep the lock window short (microseconds for a few bytes) to minimize the stall.

#### Strengths

- No deadlock risk — cog 7 cannot be interrupted by a debug ISR
- Debug messages on other cogs are deferred, not lost
- Clean synchronization via the same lock the debugger uses

#### Limitations

- Costs one cog dedicated to serial I/O (or at least one cog excluded from debug)
- Must keep the lock window short to avoid stalling debug on other cogs
- Must correctly restore the RX repository state

---

### Approach 2: BRK Suppression (TX Only, Same Cog)

Temporarily disable debug interrupts, do your I/O, then re-enable them. Avoids the deadlock by ensuring no `brk` can fire while you hold the lock.

#### How it works

```pasm
' Disable all debug interrupts on this cog
        brk     #0                ' Clear BRK condition — no BRK will trigger

' Now safe to acquire lock (no ISR can interrupt us)
.lock   locktry #15       wc
if_nc   jmp     #.lock

' Read clkfreq for later restoration
        rqpin   saved_freq, _rxpin_

' Configure TX and transmit
        fltl    _txpin_
        wrpin   #%01_11110_0, _txpin_
        wxpin   my_baud_config, _txpin_
        drvl    _txpin_

        wypin   my_byte, _txpin_
.txwait rdpin   t, _txpin_    wc
if_c    jmp     #.txwait

' Restore pin state
        fltl    _txpin_
        wrpin   #%00_00001_0, _rxpin_
        dirh    _rxpin_
        wxpin   saved_freq, _rxpin_
        dirl    _rxpin_

' Release lock
        lockrel #15

' Re-enable debug interrupts
        brk     saved_brk_cond    ' Restore previous BRK condition
```

#### The BRK condition problem

`brk #0` clears the BRK condition register, which controls what types of debug events the cog responds to. To re-enable debug, you need to restore the original BRK condition value. The debugger stores this at a fixed offset in each cog's ISR buffer in hub RAM:

```
Cog 0: $FFFC0 + $0C*4 = $FFFF0    (long at ISR register $00C)
Cog 1: $FFF40 + $0C*4 = $FFF70
Cog N: $FFFC0 - N*$80 + $0C*4
```

You would need to read this value before suppressing BRK, then write it back:

```pasm
        cogid   t
        not     t
        shl     t, #7             ' Compute cog's ISR buffer address
        add     t, #$1C*4         ' Offset to BRK condition ($00C in ISR = $1C longs from base)
        rdlong  saved_brk_cond, t ' Save current BRK condition
        brk     #0                ' Suppress
        ' ... do I/O ...
        brk     saved_brk_cond    ' Restore
```

#### Impact on debug

Any `debug()` statement that fires on ANY cog while you hold lock[15] will have its ISR stall. Any `debug()` on your OWN cog while BRK is suppressed (`brk #0`) will be **silently skipped** — the `brk` instruction in the interpreter will execute but no interrupt fires. That debug message is lost.

#### Strengths

- Works on any cog, no need to dedicate a cog
- No deadlock risk (BRK is suppressed)

#### Limitations

- Debug messages on this cog are lost during the suppression window
- Debug messages on other cogs are delayed while you hold the lock
- Recovering the BRK condition value requires reading from protected hub RAM
- More complex and error-prone than Approach 1

---

### Approach 3: TX Output Without Lock (Fire and Forget)

If you only need TX output and can tolerate the risk of collision with a debug event, you can skip the lock entirely and just use the TX pin directly.

#### How it works

```pasm
' Configure TX pin
        fltl    _txpin_
        wrpin   #%01_11110_0, _txpin_
        wxpin   my_baud_config, _txpin_
        drvl    _txpin_

' Transmit
        wypin   my_byte, _txpin_
.wait   rdpin   t, _txpin_    wc
if_c    jmp     #.wait

' Float TX when done
        fltl    _txpin_
```

#### Impact on debug

If a debug event fires mid-transmission, the debugger ISR will `fltl` the TX pin (aborting your byte), reconfigure it, send its message, then float it again. Your in-flight byte is corrupted. The debugger's output is fine because it reconfigures from scratch.

#### Strengths

- Simplest approach — no lock, no BRK manipulation
- No deadlock risk
- Works if debug events are rare or output corruption is acceptable

#### Limitations

- **No synchronization** — debug events will corrupt your output
- You may also corrupt a debug message if your reconfiguration overlaps with the ISR
- Only practical for TX; RX would be unreliable without synchronization

---

### Approach 4: Use Separate Pins (Simplest and Safest)

Use a different pair of pins for user serial I/O. No interaction with the debug system at all.

```spin2
CON
  MY_TX_PIN = 56
  MY_RX_PIN = 57
  MY_BAUD   = 115_200
```

#### Strengths

- Zero risk — no interaction with debug
- No lock contention, no deadlock, no lost messages
- Works on any cog
- Simplest code

#### Limitations

- Consumes two additional pins
- Not an option if you're pin-constrained and pins 62/63 are the only ones available

---

## Comparison Table

| | Approach 1: Non-Debug Cog | Approach 2: BRK Suppression | Approach 3: No Lock | Approach 4: Separate Pins |
|---|---|---|---|---|
| **Deadlock risk** | None | None | None | None |
| **Debug msg loss** | None (delayed) | On same cog during window | Possible corruption | None |
| **Synchronization** | Lock[15] | Lock[15] + BRK disable | None | N/A |
| **Pin restoration** | Must restore RX repository | Must restore RX repository + BRK cond | TX float only | N/A |
| **Cog cost** | 1 cog excluded from debug | None | None | None |
| **Pin cost** | 0 (shares debug pins) | 0 (shares debug pins) | 0 (shares debug pins) | 2 additional pins |
| **Complexity** | Medium | High | Low | **Trivial** |
| **Reliability** | High | Medium | Low | **Highest** |
| **TX and RX?** | Both feasible | Both feasible | TX only practical | Both |

---

## The RX Pin Repository: What You Must Preserve

Any approach that shares the debug pins **must** restore the RX pin to repository mode with the correct clkfreq before releasing lock[15]. If this is wrong, the next debug event will compute a wrong baud rate and produce garbage output.

**Restoration sequence:**

```pasm
wrpin   #%00_00001_0, _rxpin_  ' Repository mode (smart pin mode 1)
dirh    _rxpin_                 ' Enable the smart pin
wxpin   saved_freq, _rxpin_     ' Write clkfreq
dirl    _rxpin_                 ' Disable (the debugger will read it via rqpin)
```

**Where to get clkfreq:**

| Source | Method |
|--------|--------|
| Read from RX pin before reconfiguring | `rqpin saved_freq, _rxpin_` |
| Read from hub (interpreter stores it) | `rdlong saved_freq, #$44` (clkfreq_hub offset in interpreter) |
| Hardcode if clock is fixed | `mov saved_freq, ##200_000_000` |

The safest approach is to `rqpin` it from the RX pin at the start of your I/O window, before you reconfigure anything.

---

## Recommendations

**If you have two spare pins:** Use Approach 4. It's the simplest, safest, and most reliable option. The P2 has 64 pins; dedicating two to user serial costs nothing in terms of debug reliability.

**If you're truly pin-constrained:** Use Approach 1. Dedicate one cog to serial I/O with its debug bit cleared in `DEBUG_COGS`. This eliminates deadlock while sharing the debug pins safely through lock[15].

**If you can't spare a cog either:** Use Approach 2 with BRK suppression, accepting that debug messages on your cog will be lost during the I/O window. Keep the window as short as possible.

**Avoid Approach 3** unless you're in a prototyping scenario where corrupted output is acceptable.

---

## Key Takeaways

1. **The pins are genuinely idle between debug events.** Both are floated (high-Z). The debugger reconfigures them from scratch on every interrupt, so it doesn't care what happens to them in between.

2. **Lock[15] is the synchronization mechanism.** The debugger already uses it to serialize multi-cog access. User code can participate in the same protocol.

3. **The RX pin is not really an RX pin between events.** It's a storage register holding clkfreq. Any piggybacking must preserve this value or debug communication breaks.

4. **The deadlock is the hard constraint.** The ISR spin-waits on lock[15] inside an interrupt handler. If you hold the lock on a cog that can receive debug interrupts, you risk permanent deadlock.

5. **The debugger is self-contained.** It saves and restores all cog state, reconfigures pins from scratch, and uses its own baud computation. This makes piggybacking feasible — there's no fragile persistent state to maintain, just the RX repository.

---

*This guide describes the P2 debug pin lifecycle as implemented in Spin2_debugger.spin2 (v51) and Spin2_interpreter.spin2 (v52), compiled by the PNut-TS compiler.*
