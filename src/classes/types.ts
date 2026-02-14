/* eslint-disable @typescript-eslint/no-duplicate-enum-values */
// various type definitions

// src/classes/types.ts

'use strict';

export enum eElementType {
  type_undefined = 0, // 0x00 (undefined symbol, must be 0)
  type_pre_command = 1, // 0x01 preprocessor commands DEFINE/UNDEF/IFDEF/IFNDEF/ELSEIFDEF/ELSEIFNDEF/ELSE/ENDIF
  type_pre_symbol = 2, // 0x02 preprocessor symbols
  type_left = 3, // 0x03 (
  type_right = 4, // 0x04 )
  type_leftb = 5, // 0x05 [
  type_rightb = 6, // 0x06 ]
  type_comma = 7, // 0x07 ,
  type_equal = 8, // 0x08 =
  type_pound = 9, // 0x09 #
  type_colon = 10, // 0x0A :
  type_back = 11, // 0x0B \
  type_under = 12, // 0x0C _
  type_tick = 13, // 0x0D `
  type_dollar = 14, // 0x0E $ (without a hex digit following)
  type_dollar2 = 15, // 0x0F $$
  type_percent = 16, // 0x10 % (without a bin digit or quote following)
  type_dot = 17, // 0x11 .
  type_dotdot = 18, // 0x12 ..
  type_at = 19, // 0x13 @
  type_atat = 20, // 0x14 @@
  type_upat = 21, // 0x15 ^@
  type_til = 22, // 0x16 ~
  type_tiltil = 23, // 0x17 ~~
  type_inc = 24, // 0x18 ++
  type_dec = 25, // 0x19 --
  type_rnd = 26, // 0x1A ??
  type_assign = 27, // 0x1B :=
  type_swap = 28, // 0x1C :=:
  type_op = 29, // 0x1D !, -, ABS, ENC, etc.
  type_float = 30, // 0x1E FLOAT
  type_round = 31, // 0x1F ROUND
  type_trunc = 32, // 0x20 TRUNC
  type_constr = 33, // 0x21 STRING
  type_conlstr = 34, // 0x22 LSTRING
  type_block = 35, // 0x23 CON, VAR, DAT, OBJ, PUB, PRI
  type_field = 36, // 0x24 FIELD
  type_struct = 37, // 0x25 STRUCT
  type_sizeof = 38, // 0x26 SIZEOF
  type_size = 39, // 0x27 BYTE, WORD, LONG
  type_size_fit = 40, // 0x28 BYTEFIT, WORDFIT
  type_fvar = 41, // 0x29 FVAR, FVARS
  type_file = 42, // 0x2A FILE
  type_if = 43, // 0x2B IF
  type_ifnot = 44, // 0x2C IFNOT
  type_elseif = 45, // 0x2D ELSEIF
  type_elseifnot = 46, // 0x2E ELSEIFNOT
  type_else = 47, // 0x2F ELSE
  type_case = 48, // 0x30 CASE
  type_case_fast = 49, // 0x31 CASE_FAST
  type_other = 50, // 0x32 OTHER
  type_repeat = 51, // 0x33 REPEAT
  type_repeat_var = 52, // 0x34 REPEAT var - different QUIT method
  type_repeat_count = 53, // 0x35 REPEAT count - different QUIT method
  type_repeat_count_var = 54, // 0x36 REPEAT count WITH var - different QUIT method
  type_while = 55, // 0x37 WHILE
  type_until = 56, // 0x38 UNTIL
  type_from = 57, // 0x39 FROM
  type_to = 58, // 0x3A TO
  type_step = 59, // 0x3B STEP
  type_with = 60, // 0x3C WITH
  type_i_next_quit = 61, // 0x3D NEXT/QUIT
  type_i_return = 62, // 0x3E RETURN
  type_i_abort = 63, // 0x3F ABORT
  type_i_look = 64, // 0x40 LOOKUPZ, LOOKUP, LOOKDOWNZ, LOOKDOWN
  type_i_cogspin = 65, // 0x41 COGSPIN
  type_i_taskspin = 66, // 0x42 TASKSPIN
  type_i_flex = 67, // 0x43 HUBSET, COGINIT, COGSTOP...
  type_recv = 68, // 0x44 RECV
  type_send = 69, // 0x45 SEND
  type_debug = 70, // 0x46 DEBUG
  type_debug_cmd = 71, // 0x47 DEBUG commands
  type_asm_end = 72, // 0x48 END
  type_asm_dir = 73, // 0x49 ORGH, ORG, ORGF, RES, FIT
  type_asm_cond = 74, // 0x4A IF_C, IF_Z, IF_NC, etc
  type_asm_inst = 75, // 0x4B RDBYTE, RDWORD, RDLONG, etc.
  type_asm_effect = 76, // 0x4C WC, WZ, WCZ
  type_asm_effect2 = 77, // 0x4D ANDC, ANDZ, ORC, ORZ, XORC, XORZ
  type_reg = 78, // 0x4E REG
  type_con_int = 79, // 0x4F C0 user constant integer (C0..C2 must be contiguous)
  type_con_float = 80, // 0x50 C1 user constant float
  type_con_struct = 81, // 0x51 C2 user data structure
  type_register = 82, // 0x52 user register long
  type_loc_byte = 83, // 0x53 L0 user loc byte (L0..L11 must be contiguous)
  type_loc_word = 84, // 0x54 L1 user loc word
  type_loc_long = 85, // 0x55 L2 user loc long
  type_loc_struct = 86, // 0x56 L3 user loc struct
  type_loc_byte_ptr = 87, // 0x57 L4 user loc byte ptr
  type_loc_word_ptr = 88, // 0x58 L5 user loc word ptr
  type_loc_long_ptr = 89, // 0x59 L6 user loc long ptr
  type_loc_struct_ptr = 90, // 0x5A L7 user loc struct ptr
  type_loc_byte_ptr_val = 91, // 0x5B L8 internal loc byte ptr val
  type_loc_word_ptr_val = 92, // 0x5C L9 internal loc word ptr val
  type_loc_long_ptr_val = 93, // 0x5D L10 internal loc long ptr val
  type_loc_struct_ptr_val = 94, // 0x5E L11 internal loc struct ptr val
  type_var_byte = 95, // 0x5F V0 user var byte (V0..V11 must be contiguous)
  type_var_word = 96, // 0x60 V1 user var word
  type_var_long = 97, // 0x61 V2 user var long
  type_var_struct = 98, // 0x62 V3 user var struct
  type_var_byte_ptr = 99, // 0x63 V4 user var byte ptr
  type_var_word_ptr = 100, // 0x64 V5 user var word ptr
  type_var_long_ptr = 101, // 0x65 V6 user var long ptr
  type_var_struct_ptr = 102, // 0x66 V7 user var struct ptr
  type_var_byte_ptr_val = 103, // 0x67 V8 internal var byte ptr val
  type_var_word_ptr_val = 104, // 0x68 V9 internal var word ptr val
  type_var_long_ptr_val = 105, // 0x69 V10 internal var long ptr val
  type_var_struct_ptr_val = 106, // 0x6A V11 internal var struct ptr val
  type_dat_byte = 107, // 0x6B D0 user dat byte (D0..D3 must be contiguous)
  type_dat_word = 108, // 0x6C D1 user dat word
  type_dat_long = 109, // 0x6D D2 user dat long
  type_dat_struct = 110, // 0x6E D3 user dat struct
  type_dat_long_res = 111, // 0x6F (D2) user dat long reserve
  type_hub_byte = 112, // 0x70 H0 user hub byte (unused) (H0..H2 must be contiguous)
  type_hub_word = 113, // 0x71 H1 user hub word (unused)
  type_hub_long = 114, // 0x72 H2 user hub long (CLKMODE, CLKFREQ)
  type_obj = 115, // 0x73 user object
  type_obj_con_int = 116, // 0x74 O1 user object.constant integer (O0..O2 must be contiguous)
  type_obj_con_float = 117, // 0x75 O2 user object.constant float
  type_obj_con_struct = 118, // 0x76 O3 user object.constant structure
  type_obj_pub = 119, // 0x77 user object.method()
  type_method = 120, // 0x78 user method
  type_end = 121, // 0x79 end of line
  type_end_file = 122 // 0x7A end-of-file
}

export enum eOperationType {
  //
  //
  // Operators
  //
  //    Operator precedence (highest to lowest)
  //
  //    !, -, ABS, FABS, ENCOD, DECOD, BMASK, ONES, SQRT, FSQRT, QLOG, QEXP,...         (unary)
  //    1       >>, <<, SAR, ROR, ROL, REV, ZEROX, SIGNX                                (binary)
  //    2       &                                                                       (binary)
  //    3       ^                                                                       (binary)
  //    4       |                                                                       (binary)
  //    5       *, *., /, /., +/, //, +//, SCA, SCAS, FRAC                              (binary)
  //    6       +, +., -, -., POW                                                       (binary)
  //    7       #>, <#                                                                  (binary)
  //    8       ADDBITS, ADDPINS                                                        (binary)
  //    9       <, <., +<, <=, <=., +<=, ==, ==., <>, <>., >=, >=., +>=, >, >., +>, <=> (binary)
  //    10      !!, NOT                                                                 (unary)
  //    11      &&, AND                                                                 (binary)
  //    12      ^^, XOR                                                                 (binary)
  //    13      ||, OR                                                                  (binary)
  //    14      ? :                                                                     (ternary)
  //
  //
  //                                    oper            type            prec    float
  //
  op_bitnot = 0, // 0x00 !              unary           0       -
  op_neg = 1, // 0x01 -                 unary           0       yes
  op_fneg = 2, // 0x02 -.               unary           0       -
  op_abs = 3, // 0x03 ABS               unary           0       yes
  op_fabs = 4, // 0x04 FABS             unary           0       -
  op_encod = 5, // 0x05 ENCOD           unary           0       -
  op_decod = 6, // 0x06 DECOD           unary           0       -
  op_bmask = 7, // 0x07 BMASK           unary           0       -
  op_ones = 8, // 0x08 ONES             unary           0       -
  op_sqrt = 9, // 0x09 SQRT             unary           0       -
  op_fsqrt = 10, // 0x0a FSQRT          unary           0       -
  op_qlog = 11, // 0x0b QLOG            unary           0       -
  op_qexp = 12, // 0x0c QEXP            unary           0       -
  op_log2 = 13, // 0x0d LOG2            unary           0       -
  op_log10 = 14, // 0x0e LOG10          unary           0       -
  op_log = 15, // 0x0f LOG              unary           0       -
  op_exp2 = 16, // 0x10 EXP2            unary           0       -
  op_exp10 = 17, // 0x11 EXP10          unary           0       -
  op_exp = 18, // 0x12 EXP              unary           0       -
  op_shr = 19, // 0x13 >>               binary          1       -
  op_shl = 20, // 0x14 <<               binary          1       -
  op_sar = 21, // 0x15 SAR              binary          1       -
  op_ror = 22, // 0x16 ROR              binary          1       -
  op_rol = 23, // 0x17 ROL              binary          1       -
  op_rev = 24, // 0x18 REV              binary          1       -
  op_zerox = 25, // 0x19 ZEROX          binary          1       -
  op_signx = 26, // 0x1a SIGNX          binary          1       -
  op_bitand = 27, // 0x1b &             binary          2       -
  op_bitxor = 28, // 0x1c ^             binary          3       -
  op_bitor = 29, // 0x1d |              binary          4       -
  op_mul = 30, // 0x1e *                binary          5       yes
  op_fmul = 31, // 0x1f *.              binary          5       -
  op_div = 32, // 0x20 /                binary          5       yes
  op_fdiv = 33, // 0x21 /.              binary          5       -
  op_divu = 34, // 0x22 +/              binary          5       -
  op_rem = 35, // 0x23 //               binary          5       -
  op_remu = 36, // 0x24 +//             binary          5       -
  op_sca = 37, // 0x25 SCA              binary          5       -
  op_scas = 38, // 0x26 SCAS            binary          5       -
  op_frac = 39, // 0x27 FRAC            binary          5       -
  op_add = 40, // 0x28 +                binary          6       yes
  op_fadd = 41, // 0x29 +.              binary          6       -
  op_sub = 42, // 0x2a -                binary          6       yes
  op_fsub = 43, // 0x2b -.              binary          6       -
  op_pow = 44, // 0x2c POW              binary          6       yes
  op_fge = 45, // 0x2d #>               binary          7       yes
  op_fle = 46, // 0x2e <#               binary          7       yes
  op_addbits = 47, // 0x2f ADDBITS      binary          8       -
  op_addpins = 48, // 0x30 ADDPINS      binary          8       -
  op_lt = 49, // 0x31 <                 binary          9       yes
  op_flt = 50, // 0x32 <.               binary          9       -
  op_ltu = 51, // 0x33 +<               binary          9       -
  op_lte = 52, // 0x34 <=               binary          9       yes
  op_flte = 53, // 0x35 <=.             binary          9       -
  op_lteu = 54, // 0x36 +<=             binary          9       -
  op_e = 55, // 0x37 ==                 binary          9       yes
  op_fe = 56, // 0x38 ==.               binary          9       -
  op_ne = 57, // 0x39 <>                binary          9       yes
  op_fne = 58, // 0x3a <>.              binary          9       -
  op_gte = 59, // 0x3b >=               binary          9       yes
  op_fgte = 60, // 0x3c >=.             binary          9       -
  op_gteu = 61, // 0x3d +>=             binary          9       -
  op_gt = 62, // 0x3e >                 binary          9       yes
  op_fgt = 63, // 0x3f >.               binary          9       -
  op_gtu = 64, // 0x40 +>               binary          9       -
  op_ltegt = 65, // 0x41 <=>            binary          9       yes
  op_lognot = 66, // 0x42 !!, NOT       unary           10      -
  op_logand = 67, // 0x43 &&, AND       binary          11      -
  op_logxor = 68, // 0x44 ^^, XOR       binary          12      -
  op_logor = 69, // 0x45 ||, OR         binary          13      -
  op_ternary = 70 // 0x46 ? (:)         ternary         14      -
}

export enum eBlockType {
  //
  // Blocks
  //
  block_con = 0, // 0x00
  block_obj = 1, // 0x01
  block_var = 2, // 0x02
  block_pub = 3, // 0x03
  block_pri = 4, // 0x04
  block_dat = 5 // 0x05
}

export enum eValueType {
  value_undefined = 0, // no value determined
  //
  // Directives
  //
  dir_orgh = 0, // 0x00
  dir_alignw = 1, // 0x01
  dir_alignl = 2, // 0x02
  dir_org = 3, // 0x03
  dir_orgf = 4, // 0x04
  dir_res = 5, // 0x05
  dir_fit = 6, // 0x06
  dir_ditto = 7, // 0x07
  //
  // Ifs
  //
  if_ret = 0, // 0x00  (also, if_return) (P1 was if_never)
  if_nc_and_nz = 1, // 0x01
  if_nc_and_z = 2, // 0x02
  if_nc = 3, // 0x03
  if_c_and_nz = 4, // 0x04
  if_nz = 5, // 0x05
  if_c_ne_z = 6, // 0x06
  if_nc_or_nz = 7, // 0x07
  if_c_and_z = 8, // 0x08
  if_c_eq_z = 9, // 0x09
  if_z = 10, // 0x0a
  if_nc_or_z = 11, // 0x0b
  if_c = 12, // 0x0c
  if_c_or_nz = 13, // 0x0d
  if_c_or_z = 14, // 0x0e
  if_always = 15, // 0x0f
  //
  // Info types
  //
  info_con = 0, // 0x00 data0 = value (must be followed by info_con_float)
  info_con_float = 1, // 0x01 data0 = value
  info_dat = 2, // 0x02 data0/1 = obj start/finish
  info_dat_symbol = 3, // 0x03 data0 = offset, data1 = size
  info_pub = 4, // 0x04 data0/1 = obj start/finish, data2/3 = name start/finish
  info_pri = 5, // 0x05 data0/1 = obj start/finish, data2/3 = name start/finish
  //
  // Assembly push/pops
  //
  pp_pusha = 0, // 0x00 PUSHA   D/#     -->     WRLONG  D/#,PTRA++
  pp_pushb = 1, // 0x01 PUSHB   D/#     -->     WRLONG  D/#,PTRB++
  pp_popa = 2, // 0x02 POPA     D       -->     RDLONG  D,--PTRA
  pp_popb = 3, // 0x03 POPB     D       -->     RDLONG  D,--PTRB
  //
  // lower DEBUG commands
  //
  dc_end = 0, // 0x00
  dc_asm = 1, // 0x01
  dc_if = 2, // 0x02
  dc_ifnot = 3, // 0x03
  dc_cogn = 4, // 0x04
  dc_chr = 5, // 0x05
  dc_str = 6, // 0x06
  dc_dly = 7, // 0x07
  dc_pc_key = 8, // 0x08
  dc_pc_mouse = 9, // 0x09
  dc_c_z_pre = 10, // 0x0a
  dc_c_z = 11, // 0x0b

  // discrete values
  taskhlt_reg = 460, // 0x1CC
  prx_regs = 472, // 0x1D8

  // operands
  operand_ds = 0, // 0x00
  operand_bitx = 1, // 0x01
  operand_testb = 2, // 0x02
  operand_du = 3, // 0x03
  operand_duii = 4, // 0x04
  operand_duiz = 5, // 0x05
  operand_ds3set = 6, // 0x06
  operand_ds3get = 7, // 0x07
  operand_ds2set = 8, // 0x08
  operand_ds2get = 9, // 0x09
  operand_ds1set = 10, // 0x0a
  operand_ds1get = 11, // 0x0b
  operand_dsj = 12, // 0x0c
  operand_ls = 13, // 0x0d
  operand_lsj = 14, // 0x0e
  operand_dsp = 15, // 0x0f
  operand_lsp = 16, // 0x10
  operand_rep = 17, // 0x11
  operand_jmp = 18, // 0x12
  operand_call = 19, // 0x13
  operand_calld = 20, // 0x14
  operand_jpoll = 21, // 0x15
  operand_loc = 22, // 0x16
  operand_aug = 23, // 0x17
  operand_d = 24, // 0x18
  operand_de = 25, // 0x19
  operand_l = 26, // 0x1a
  operand_cz = 27, // 0x1b
  operand_pollwait = 28, // 0x1c
  operand_getbrk = 29, // 0x1d
  operand_pinop = 30, // 0x1e
  operand_testp = 31, // 0x1f
  operand_pushpop = 32, // 0x20
  operand_xlat = 33, // 0x21
  operand_akpin = 34, // 0x22
  operand_asmclk = 35, // 0x23
  operand_nop = 36, // 0x24
  operand_debug = 37, // 0x25

  // ************************************************************************
  // *  DEBUG Display Parser                        *
  // ************************************************************************
  //
  dd_end = 0, // (0x00)   end of line	elements
  dd_dis = 1, // (0x01)   display type
  dd_nam = 2, // (0x02)   display name
  dd_key = 3, // (0x03)   display command
  dd_num = 4, // (0x04)   number, $num/%num/num
  dd_str = 5, // (0x05)   string, 'text'
  dd_unk = 6, // (0x06)   unknown symbol

  dd_dis_logic = 0, // (0x00)   LOGIC		displays
  dd_dis_scope = 1, // (0x01)   SCOPE
  dd_dis_scope_xy = 2, // (0x02)   SCOPE_XY
  dd_dis_fft = 3, // (0x03)   FFT
  dd_dis_spectro = 4, // (0x04)   SPECTRO
  dd_dis_plot = 5, // (0x05)   PLOT
  dd_dis_term = 6, // (0x06)   TERM
  dd_dis_bitmap = 7, // (0x07)   BITMAP
  dd_dis_midi = 8, // (0x08)   MIDI

  dd_key_black = 0, // (0x00)   BLACK		color group
  dd_key_white = 1, // (0x01)   WHITE
  dd_key_orange = 2, // (0x02)   ORANGE
  dd_key_blue = 3, // (0x03)   BLUE
  dd_key_green = 4, // (0x04)   GREEN
  dd_key_cyan = 5, // (0x05)   CYAN
  dd_key_red = 6, // (0x06)   RED
  dd_key_magenta = 7, // (0x07)   MAGENTA
  dd_key_yellow = 8, // (0x08)   YELLOW
  dd_key_gray = 9, // (0x09)   GRAY

  dd_key_lut1 = 10, // (0x0a)   LUT1		color-mode group
  dd_key_lut2 = 11, // (0x0b)   LUT2
  dd_key_lut4 = 12, // (0x0c)   LUT4
  dd_key_lut8 = 13, // (0x0d)   LUT8
  dd_key_luma8 = 14, // (0x0e)   LUMA8
  dd_key_luma8w = 15, // (0x0f)   LUMA8W
  dd_key_luma8x = 16, // (0x10)   LUMA8X
  dd_key_hsv8 = 17, // (0x11)   HSV8
  dd_key_hsv8w = 18, // (0x12)   HSV8W
  dd_key_hsv8x = 19, // (0x13)   HSV8X
  dd_key_rgbi8 = 20, // (0x14)   RGBI8
  dd_key_rgbi8w = 21, // (0x15)   RGBI8W
  dd_key_rgbi8x = 22, // (0x16)   RGBI8X
  dd_key_rgb8 = 23, // (0x17)   RGB8
  dd_key_hsv16 = 24, // (0x18)   HSV16
  dd_key_hsv16w = 25, // (0x19)   HSV16W
  dd_key_hsv16x = 26, // (0x1a)   HSV16X
  dd_key_rgb16 = 27, // (0x1b)   RGB16
  dd_key_rgb24 = 28, // (0x1c)   RGB24

  dd_key_longs_1bit = 29, // (0x1d)   LONGS_1BIT	pack-data group
  dd_key_longs_2bit = 30, // (0x1e)   LONGS_2BIT
  dd_key_longs_4bit = 31, // (0x1f)   LONGS_4BIT
  dd_key_longs_8bit = 32, // (0x20)   LONGS_8BIT
  dd_key_longs_16bit = 33, // (0x21)   LONGS_16BIT
  dd_key_words_1bit = 34, // (0x22)   WORDS_1BIT
  dd_key_words_2bit = 35, // (0x23)   WORDS_2BIT
  dd_key_words_4bit = 36, // (0x24)   WORDS_4BIT
  dd_key_words_8bit = 37, // (0x25)   WORDS_8BIT
  dd_key_bytes_1bit = 38, // (0x26)   BYTES_1BIT
  dd_key_bytes_2bit = 39, // (0x27)   BYTES_2BIT
  dd_key_bytes_4bit = 40, // (0x28)   BYTES_4BIT

  dd_key_alt = 41, // (0x29)   ALT		keywords
  dd_key_auto = 42, // (0x2a)   AUTO
  dd_key_backcolor = 43, // (0x2b)   BACKCOLOR
  dd_key_box = 44, // (0x2c)   BOX
  dd_key_cartesian = 45, // (0x2d)   CARTESIAN
  dd_key_channel = 46, // (0x2e)   CHANNEL
  dd_key_circle = 47, // (0x2f)   CIRCLE
  dd_key_clear = 48, // (0x30)   CLEAR
  dd_key_close = 49, // (0x31)   CLOSE
  dd_key_color = 50, // (0x32)   COLOR
  dd_key_crop = 51, // (0x33)   CROP
  dd_key_depth = 52, // (0x34)   DEPTH
  dd_key_dot = 53, // (0x35)   DOT
  dd_key_dotsize = 54, // (0x36)   DOTSIZE
  dd_key_hidexy = 55, // (0x37)   HIDEXY
  dd_key_holdoff = 56, // (0x38)   HOLDOFF
  dd_key_layer = 57, // (0x39)   LAYER
  dd_key_line = 58, // (0x3a)   LINE
  dd_key_linesize = 59, // (0x3b)   LINESIZE
  dd_key_logscale = 60, // (0x3c)   LOGSCALE
  dd_key_lutcolors = 61, // (0x3d)   LUTCOLORS
  dd_key_mag = 62, // (0x3e)   MAG
  dd_key_obox = 63, // (0x3f)   OBOX
  dd_key_opacity = 64, // (0x40)   OPACITY
  dd_key_origin = 65, // (0x41)   ORIGIN
  dd_key_oval = 66, // (0x42)   OVAL
  dd_key_pc_key = 67, // (0x43)   PC_KEY
  dd_key_pc_mouse = 68, // (0x44)   PC_MOUSE
  dd_key_polar = 69, // (0x45)   POLAR
  dd_key_pos = 70, // (0x46)   POS
  dd_key_precise = 71, // (0x47)   PRECISE
  dd_key_range = 72, // (0x48)   RANGE
  dd_key_rate = 73, // (0x49)   RATE
  dd_key_samples = 74, // (0x4a)   SAMPLES
  dd_key_save = 75, // (0x4b)   SAVE
  dd_key_scroll = 76, // (0x4c)   SCROLL
  dd_key_set = 77, // (0x4d)   SET
  dd_key_signed = 78, // (0x4e)   SIGNED
  dd_key_size = 79, // (0x4f)   SIZE
  dd_key_spacing = 80, // (0x50)   SPACING
  dd_key_sparse = 81, // (0x51)   SPARSE
  dd_key_sprite = 82, // (0x52)   SPRITE
  dd_key_spritedef = 83, // (0x53)   SPRITEDEF
  dd_key_text = 84, // (0x54)   TEXT
  dd_key_textangle = 85, // (0x55)   TEXTANGLE
  dd_key_textsize = 86, // (0x56)   TEXTSIZE
  dd_key_textstyle = 87, // (0x57)   TEXTSTYLE
  dd_key_title = 88, // (0x58)   TITLE
  dd_key_trace = 89, // (0x59)   TRACE
  dd_key_trigger = 90, // (0x5a)   TRIGGER
  dd_key_update = 91, // (0x5b)   UPDATE
  dd_key_window = 92, // (0x5c)   WINDOW

  // ************************************************************************
  // *  Disassembler                                                        *
  // ************************************************************************
  disop_addr20 = 0, // (0x00)   operand symbols
  disop_aug = 1, // (0x01)
  disop_cz = 2, // (0x02)
  disop_d = 3, // (0x03)
  disop_dc = 4, // (0x04)
  disop_dc_modc = 5, // (0x05)
  disop_dcz = 6, // (0x06)
  disop_dcz_modcz = 7, // (0x07)
  disop_ds = 8, // (0x08)
  disop_ds_alt = 9, // (0x09)
  disop_ds_alti = 10, // (0x0a)
  disop_ds_branch = 11, // (0x0b)
  disop_ds_byte = 12, // (0x0c)
  disop_ds_nib = 13, // (0x0d)
  disop_ds_ptr = 14, // (0x0e)
  disop_ds_single = 15, // (0x0f)
  disop_ds_word = 16, // (0x10)
  disop_dsc = 17, // (0x11)
  disop_dscz = 18, // (0x12)
  disop_dscz_bit = 19, // (0x13)
  disop_dscz_bit_log = 20, // (0x14)
  disop_dscz_branch = 21, // (0x15)
  disop_dscz_ptr = 22, // (0x16)
  disop_dscz_single = 23, // (0x17)
  disop_dsz = 24, // (0x18)
  disop_dz_modz = 25, // (0x19)
  disop_l = 26, // (0x1a)
  disop_lc = 27, // (0x1b)
  disop_lcz = 28, // (0x1c)
  disop_lcz_pin = 29, // (0x1d)
  disop_lcz_pin_log = 30, // (0x1e)
  disop_ls = 31, // (0x1f)
  disop_ls_branch = 32, // (0x20)
  disop_ls_pin = 33, // (0x21)
  disop_ls_ptr = 34, // (0x22)
  disop_lsc = 35, // (0x23)
  disop_lx = 36, // (0x24)
  disop_none = 37, // (0x25)
  disop_p_addr20 = 38, // (0x26)
  disop_s = 39, // (0x27)
  disop_s_branch = 40, // (0x28)
  disop_s_pin = 41 // (0x29)
}

export enum eByteCode {
  bc_drop = 0, // 0x00 main bytecodes
  bc_drop_push = 1, // 0x01
  bc_drop_trap = 2, // 0x02
  bc_drop_trap_push = 3, // 0x03
  bc_return_results = 4, // 0x04
  bc_return_args = 5, // 0x05
  bc_abort_0 = 6, // 0x06
  bc_abort_arg = 7, // 0x07
  bc_call_obj_sub = 8, // 0x08
  bc_call_obji_sub = 9, // 0x09
  bc_call_sub = 10, // 0x0a
  bc_call_ptr = 11, // 0x0b
  bc_call_recv = 12, // 0x0c
  bc_call_send = 13, // 0x0d
  bc_call_send_bytes = 14, // 0x0e
  bc_mptr_obj_sub = 15, // 0x0f
  bc_mptr_obji_sub = 16, // 0x10
  bc_mptr_sub = 17, // 0x11
  bc_jmp = 18, // 0x12
  bc_jz = 19, // 0x13
  bc_jnz = 20, // 0x14
  bc_tjz = 21, // 0x15
  bc_djnz = 22, // 0x16
  bc_pop = 23, // 0x17
  bc_pop_rfvar = 24, // 0x18
  bc_hub_bytecode = 25, // 0x19
  bc_case_fast_init = 26, // 0x1a
  bc_case_fast_done = 27, // 0x1b
  bc_case_value = 28, // 0x1c
  bc_case_range = 29, // 0x1d
  bc_case_done = 30, // 0x1e
  bc_lookup_value = 31, // 0x1f
  bc_lookdown_value = 32, // 0x20
  bc_lookup_range = 33, // 0x21
  bc_lookdown_range = 34, // 0x22
  bc_look_done = 35, // 0x23
  bc_add_pbase = 36, // 0x24
  bc_coginit = 37, // 0x25
  bc_coginit_push = 38, // 0x26
  bc_cogstop = 39, // 0x27
  bc_cogid = 40, // 0x28
  bc_locknew = 41, // 0x29
  bc_lockret = 42, // 0x2a
  bc_locktry = 43, // 0x2b
  bc_lockrel = 44, // 0x2c
  bc_lockchk = 45, // 0x2d
  bc_cogatn = 46, // 0x2e
  bc_pollatn = 47, // 0x2f
  bc_waitatn = 48, // 0x30
  bc_getrnd = 49, // 0x31
  bc_getct = 50, // 0x32
  bc_pollct = 51, // 0x33
  bc_waitct = 52, // 0x34
  bc_pinlow = 53, // 0x35
  bc_pinhigh = 54, // 0x36
  bc_pintoggle = 55, // 0x37
  bc_pinfloat = 56, // 0x38
  bc_wrpin = 57, // 0x39
  bc_wxpin = 58, // 0x3a
  bc_wypin = 59, // 0x3b
  bc_akpin = 60, // 0x3c
  bc_rdpin = 61, // 0x3d
  bc_rqpin = 62, // 0x3e
  bc_tasknext = 63, // 0x3f
  bc_unused = 64, // 0x40
  bc_debug = 65, // 0x41
  bc_con_rfbyte = 66, // 0x42
  bc_con_rfbyte_not = 67, // 0x43
  bc_con_rfword = 68, // 0x44
  bc_con_rfword_not = 69, // 0x45
  bc_con_rflong = 70, // 0x46
  bc_con_rfbyte_decod = 71, // 0x47
  bc_con_rfbyte_decod_not = 72, // 0x48
  bc_con_rfbyte_bmask = 73, // 0x49
  bc_con_rfbyte_bmask_not = 74, // 0x4a
  bc_setup_field_p = 75, // 0x4b
  bc_setup_field_pi = 76, // 0x4c
  bc_setup_reg = 77, // 0x4d
  bc_setup_reg_pi = 78, // 0x4e
  bc_setup_byte_pbase = 79, // 0x4f
  bc_setup_byte_vbase = 80, // 0x50
  bc_setup_byte_dbase = 81, // 0x51
  bc_setup_byte_pbase_pi = 82, // 0x52
  bc_setup_byte_vbase_pi = 83, // 0x53
  bc_setup_byte_dbase_pi = 84, // 0x54
  bc_setup_word_pbase = 85, // 0x55
  bc_setup_word_vbase = 86, // 0x56
  bc_setup_word_dbase = 87, // 0x57
  bc_setup_word_pbase_pi = 88, // 0x58
  bc_setup_word_vbase_pi = 89, // 0x59
  bc_setup_word_dbase_pi = 90, // 0x5a
  bc_setup_long_pbase = 91, // 0x5b
  bc_setup_long_vbase = 92, // 0x5c
  bc_setup_long_dbase = 93, // 0x5d
  bc_setup_long_pbase_pi = 94, // 0x5e
  bc_setup_long_vbase_pi = 95, // 0x5f
  bc_setup_long_dbase_pi = 96, // 0x60
  bc_setup_byte_pa = 97, // 0x61
  bc_setup_word_pa = 98, // 0x62
  bc_setup_long_pa = 99, // 0x63
  bc_setup_byte_pb_pi = 100, // 0x64
  bc_setup_word_pb_pi = 101, // 0x65
  bc_setup_long_pb_pi = 102, // 0x66
  bc_setup_struct_pbase = 103, // 0x67
  bc_setup_struct_vbase = 104, // 0x68
  bc_setup_struct_dbase = 105, // 0x69
  bc_setup_struct_pop = 106, // 0x6a
  bc_ternary = 107, // 0x6b
  bc_lt = 108, // 0x6c
  bc_ltu = 109, // 0x6d
  bc_lte = 110, // 0x6e
  bc_lteu = 111, // 0x6f
  bc_e = 112, // 0x70
  bc_ne = 113, // 0x71
  bc_gte = 114, // 0x72
  bc_gteu = 115, // 0x73
  bc_gt = 116, // 0x74
  bc_gtu = 117, // 0x75
  bc_ltegt = 118, // 0x76
  bc_lognot = 119, // 0x77
  bc_bitnot = 120, // 0x78
  bc_neg = 121, // 0x79
  bc_abs = 122, // 0x7a
  bc_encod = 123, // 0x7b
  bc_decod = 124, // 0x7c
  bc_bmask = 125, // 0x7d
  bc_ones = 126, // 0x7e
  bc_sqrt = 127, // 0x7f
  bc_qlog = 128, // 0x80
  bc_qexp = 129, // 0x81
  bc_shr = 130, // 0x82
  bc_shl = 131, // 0x83
  bc_sar = 132, // 0x84
  bc_ror = 133, // 0x85
  bc_rol = 134, // 0x86
  bc_rev = 135, // 0x87
  bc_zerox = 136, // 0x88
  bc_signx = 137, // 0x89
  bc_add = 138, // 0x8a
  bc_sub = 139, // 0x8b
  bc_logand = 140, // 0x8c
  bc_logxor = 141, // 0x8d
  bc_logor = 142, // 0x8e
  bc_bitand = 143, // 0x8f
  bc_bitxor = 144, // 0x90
  bc_bitor = 145, // 0x91
  bc_fge = 146, // 0x92
  bc_fle = 147, // 0x93
  bc_addbits = 148, // 0x94
  bc_addpins = 149, // 0x95
  bc_mul = 150, // 0x96
  bc_div = 151, // 0x97
  bc_divu = 152, // 0x98
  bc_rem = 153, // 0x99
  bc_remu = 154, // 0x9a
  bc_sca = 155, // 0x9b
  bc_scas = 156, // 0x9c
  bc_frac = 157, // 0x9d
  bc_string = 158, // 0x9e
  bc_bitrange = 159, // 0x9f
  bc_con_n = 160, // 0xa0
  bc_setup_reg_1D8_1F8 = 176, // 0xb0
  bc_setup_var_0_15 = 192, // 0xc0
  bc_setup_local_0_15 = 208, // 0xd0
  bc_read_local_0_15 = 224, // 0xe0
  bc_write_local_0_15 = 240, // 0xf0
  bc_set_incdec = 121, // 0x79 variable operator bytecodes
  bc_repeat_var_init_n = 122, // 0x7a
  bc_repeat_var_init_1 = 123, // 0x7b
  bc_repeat_var_init = 124, // 0x7c
  bc_repeat_var_loop = 125, // 0x7d
  bc_get_field = 126, // 0x7e
  bc_get_addr = 127, // 0x7f
  bc_read = 128, // 0x80
  bc_write = 129, // 0x81
  bc_write_push = 130, // 0x82
  bc_var_inc = 131, // 0x83
  bc_var_dec = 132, // 0x84
  bc_var_preinc_push = 133, // 0x85
  bc_var_predec_push = 134, // 0x86
  bc_var_postinc_push = 135, // 0x87
  bc_var_postdec_push = 136, // 0x88
  bc_var_lognot = 137, // 0x89
  bc_var_lognot_push = 138, // 0x8a
  bc_var_bitnot = 139, // 0x8b
  bc_var_bitnot_push = 140, // 0x8c
  bc_var_swap = 141, // 0x8d
  bc_var_rnd = 142, // 0x8e
  bc_var_rnd_push = 143, // 0x8f
  bc_lognot_write = 144, // 0x90
  bc_bitnot_write = 145, // 0x91
  bc_neg_write = 146, // 0x92
  bc_abs_write = 147, // 0x93
  bc_encod_write = 148, // 0x94
  bc_decod_write = 149, // 0x95
  bc_bmask_write = 150, // 0x96
  bc_ones_write = 151, // 0x97
  bc_sqrt_write = 152, // 0x98
  bc_qlog_write = 153, // 0x99
  bc_qexp_write = 154, // 0x9a
  bc_shr_write = 155, // 0x9b
  bc_shl_write = 156, // 0x9c
  bc_sar_write = 157, // 0x9d
  bc_ror_write = 158, // 0x9e
  bc_rol_write = 159, // 0x9f
  bc_rev_write = 160, // 0xa0
  bc_zerox_write = 161, // 0xa1
  bc_signx_write = 162, // 0xa2
  bc_add_write = 163, // 0xa3
  bc_sub_write = 164, // 0xa4
  bc_logand_write = 165, // 0xa5
  bc_logxor_write = 166, // 0xa6
  bc_logor_write = 167, // 0xa7
  bc_bitand_write = 168, // 0xa8
  bc_bitxor_write = 169, // 0xa9
  bc_bitor_write = 170, // 0xaa
  bc_fge_write = 171, // 0xab
  bc_fle_write = 172, // 0xac
  bc_addbits_write = 173, // 0xad
  bc_addpins_write = 174, // 0xae
  bc_mul_write = 175, // 0xaf
  bc_div_write = 176, // 0xb0
  bc_divu_write = 177, // 0xb1
  bc_rem_write = 178, // 0xb2
  bc_remu_write = 179, // 0xb3
  bc_sca_write = 180, // 0xb4
  bc_scas_write = 181, // 0xb5
  bc_frac_write = 182, // 0xb6
  bc_lognot_write_push = 183, // 0xb7
  bc_bitnot_write_push = 184, // 0xb8
  bc_neg_write_push = 185, // 0xb9
  bc_abs_write_push = 186, // 0xba
  bc_encod_write_push = 187, // 0xbb
  bc_decod_write_push = 188, // 0xbc
  bc_bmask_write_push = 189, // 0xbd
  bc_ones_write_push = 190, // 0xbe
  bc_sqrt_write_push = 191, // 0xbf
  bc_qlog_write_push = 192, // 0xc0
  bc_qexp_write_push = 193, // 0xc1
  bc_shr_write_push = 194, // 0xc2
  bc_shl_write_push = 195, // 0xc3
  bc_sar_write_push = 196, // 0xc4
  bc_ror_write_push = 197, // 0xc5
  bc_rol_write_push = 198, // 0xc6
  bc_rev_write_push = 199, // 0xc7
  bc_zerox_write_push = 200, // 0xc8
  bc_signx_write_push = 201, // 0xc9
  bc_add_write_push = 202, // 0xca
  bc_sub_write_push = 203, // 0xcb
  bc_logand_write_push = 204, // 0xcc
  bc_logxor_write_push = 205, // 0xcd
  bc_logor_write_push = 206, // 0xce
  bc_bitand_write_push = 207, // 0xcf
  bc_bitxor_write_push = 208, // 0xd0
  bc_bitor_write_push = 209, // 0xd1
  bc_fge_write_push = 210, // 0xd2
  bc_fle_write_push = 211, // 0xd3
  bc_addbits_write_push = 212, // 0xd4
  bc_addpins_write_push = 213, // 0xd5
  bc_mul_write_push = 214, // 0xd6
  bc_div_write_push = 215, // 0xd7
  bc_divu_write_push = 216, // 0xd8
  bc_rem_write_push = 217, // 0xd9
  bc_remu_write_push = 218, // 0xda
  bc_sca_write_push = 219, // 0xdb
  bc_scas_write_push = 220, // 0xdc
  bc_frac_write_push = 221, // 0xdd
  bc_setup_bfield_pop = 222, // 0xde
  bc_setup_bfield_rfvar = 223, // 0xdf
  bc_setup_bfield_0_31 = 224, // 0xe0
  bc_hubset = 84, // 0x54 hub bytecodes, miscellaneous routines (step by 2)
  bc_clkset = 86, // 0x56
  bc_cogspin = 88, // 0x58
  bc_cogchk = 90, // 0x5a
  bc_org = 92, // 0x5c
  bc_orgh = 94, // 0x5e
  bc_regexec = 96, // 0x60
  bc_regload = 98, // 0x62
  bc_call = 100, // 0x64
  bc_getregs = 102, // 0x66
  bc_setregs = 104, // 0x68
  bc_bytefill = 106, // 0x6a
  bc_bytemove = 108, // 0x6c
  bc_byteswap = 110, // 0x6e
  bc_bytecomp = 112, // 0x70
  bc_wordfill = 114, // 0x72
  bc_wordmove = 116, // 0x74
  bc_wordswap = 118, // 0x76
  bc_wordcomp = 120, // 0x78
  bc_longfill = 122, // 0x7a
  bc_longmove = 124, // 0x7c
  bc_longswap = 126, // 0x7e
  bc_longcomp = 128, // 0x80
  bc_strsize = 130, // 0x82
  bc_strcomp = 132, // 0x84
  bc_strcopy = 134, // 0x86
  bc_getcrc = 136, // 0x88
  bc_waitus = 138, // 0x8a
  bc_waitms = 140, // 0x8c
  bc_getms = 142, // 0x8e
  bc_getsec = 144, // 0x90
  bc_muldiv64 = 146, // 0x92
  bc_qsin = 148, // 0x94
  bc_qcos = 150, // 0x96
  bc_rotxy = 152, // 0x98
  bc_polxy = 154, // 0x9a
  bc_xypol = 156, // 0x9c
  bc_pinread = 158, // 0x9e
  bc_pinwrite = 160, // 0xa0
  bc_pinstart = 162, // 0xa2
  bc_pinclear = 164, // 0xa4
  bc_float = 166, // 0xa6 hub bytecodes, floating point routines
  bc_round = 168, // 0xa8
  bc_trunc = 170, // 0xaa
  bc_nan = 172, // 0xac
  bc_fneg = 174, // 0xae
  bc_fabs = 176, // 0xb0
  bc_flt = 178, // 0xb2
  bc_fgt = 180, // 0xb4
  bc_fne = 182, // 0xb6
  bc_fe = 184, // 0xb8
  bc_flte = 186, // 0xba
  bc_fgte = 188, // 0xbc
  bc_fadd = 190, // 0xbe
  bc_fsub = 192, // 0xc0
  bc_fmul = 194, // 0xc2
  bc_fdiv = 196, // 0xc4
  bc_pow = 198, // 0xc6
  bc_log2 = 200, // 0xc8
  bc_log10 = 202, // 0xca
  bc_log = 204, // 0xcc
  bc_exp2 = 206, // 0xce
  bc_exp10 = 208, // 0xd0
  bc_exp = 210, // 0xd2
  bc_fsqrt = 212, // 0xd4
  bc_taskspin = 214, // 0xd6 hub bytecodes, multitasking routines
  bc_taskstop = 216, // 0xd8
  bc_taskhalt = 218, // 0xda
  bc_taskcont = 220, // 0xdc
  bc_taskchk = 222, // 0xde
  bc_taskid = 224, // 0xe0
  bc_task_return = 226, // 0xe2
  // v52a new bytecodes
  bc_movbyts = 228, // 0xe4 - hub bytecodes, miscellaneous routines
  bc_endianl = 230, // 0xe6
  bc_endianw = 232 // 0xe8
}

export enum eFlexcode {
  fc_coginit,
  fc_coginit_push,
  fc_cogstop,
  fc_cogid,
  fc_cogchk,
  fc_getrnd,
  fc_getct,
  fc_pollct,
  fc_waitct,
  fc_pinlow,
  fc_pinhigh,
  fc_pintoggle,
  fc_pinfloat,
  fc_pinread,
  fc_pinwrite,
  fc_pinstart,
  fc_pinclear,
  fc_wrpin,
  fc_wxpin,
  fc_wypin,
  fc_akpin,
  fc_rdpin,
  fc_rqpin,
  fc_locknew,
  fc_lockret,
  fc_locktry,
  fc_lockrel,
  fc_lockchk,
  fc_cogatn,
  fc_pollatn,
  fc_waitatn,
  fc_hubset,
  fc_clkset,
  fc_regexec,
  fc_regload,
  fc_call,
  fc_getregs,
  fc_setregs,
  fc_bytefill,
  fc_bytemove,
  fc_byteswap,
  fc_bytecomp,
  fc_wordfill,
  fc_wordmove,
  fc_wordswap,
  fc_wordcomp,
  fc_longfill,
  fc_longmove,
  fc_longswap,
  fc_longcomp,
  fc_strsize,
  fc_strcomp,
  fc_strcopy,
  fc_getcrc,
  fc_waitus,
  fc_waitms,
  fc_getms,
  fc_getsec,
  fc_muldiv64,
  fc_qsin,
  fc_qcos,
  fc_rotxy,
  fc_polxy,
  fc_xypol,
  // v52a new flexcodes
  fc_movbyts,
  fc_endianl,
  fc_endianw,
  fc_nan,
  fc_round,
  fc_trunc,
  fc_float,
  fc_tasknext,
  fc_taskstop,
  fc_taskhalt,
  fc_taskcont,
  fc_taskchk,
  fc_taskid
}
