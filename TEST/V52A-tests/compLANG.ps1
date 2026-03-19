
# This is a PowerShell script
Write-Output ""  # one blank line at start
Get-ChildItem -Filter *.spin2 | ForEach-Object {
        $fileName = $_.Name
        #Write-Output "Processing file: $fileName"

        # NOTE: in this suite of tests, no DEBUG compiles are needed
        if ($fileName -like "*debug*") {
                # Compile demo_* files with different switches
                & PNut_shell -cd $fileName > $null 2>&1
        }
        else {
                # Compile other files with the default switch
                & PNut_shell -c $fileName > $null 2>&1
        }

        # Output the contents of Error.txt
        if (Test-Path Error.txt) {
                $errorContent = Get-Content Error.txt -Raw
                Write-Output "* $fileName -- $errorContent"
                #Write-Output ""
        }
        else {
                Write-Output "Error.txt not found."
        }
}
Write-Output "All files processed."
