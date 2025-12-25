@echo off
REM Batch compile script for ENCODING-tests
REM Run this on Windows to generate .lst.GOLD, .obj.GOLD, and .bin.GOLD files
REM using the original PNut compiler

REM Set the path to PNut.exe (adjust as needed)
SET PNUT=PNut_v51.exe

echo ============================================================
echo Compiling PASM2 Encoding Test Files
echo ============================================================
echo.

REM Compile each test file
for %%f in (pasm_encoding_*.spin2) do (
    echo Compiling %%f...
    %PNUT% -c %%f
    if errorlevel 1 (
        echo   ERROR: Failed to compile %%f
    ) else (
        echo   OK
        REM Rename outputs to .GOLD files
        if exist "%%~nf.lst" (
            copy /Y "%%~nf.lst" "%%~nf.lst.GOLD" >nul
            echo   Created %%~nf.lst.GOLD
        )
        if exist "%%~nf.obj" (
            copy /Y "%%~nf.obj" "%%~nf.obj.GOLD" >nul
            echo   Created %%~nf.obj.GOLD
        )
        if exist "%%~nf.bin" (
            copy /Y "%%~nf.bin" "%%~nf.bin.GOLD" >nul
            echo   Created %%~nf.bin.GOLD
        )
    )
    echo.
)

echo ============================================================
echo Compilation complete!
echo ============================================================
echo.
echo GOLD files created:
dir /B *.GOLD 2>nul

pause
