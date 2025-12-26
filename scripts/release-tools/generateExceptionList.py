#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
from collections import defaultdict

# Input and output file paths
input_file = "exceptions-250429.lst"
output_file = "exceptions-250429.srt"

try:
    # Read the input file
    with open(input_file, "r") as infile:
        lines = infile.readlines()

    # Parse lines into a dictionary grouped by error string
    error_groups = defaultdict(list)
    current_file = None

    for line in lines:
        # Match file paths
        file_match = re.match(r"^(\/.*\.ts)$", line.strip())
        if file_match:
            current_file = file_match.group(1)
            continue

        # Match error strings with line numbers and offsets
        error_match = re.match(r"^\s*(\d+,\d+):.*\[(error_[A-Za-z0-9_]+)\]", line.strip())
        if error_match and current_file:
            line_offset, error_string = error_match.groups()
            error_groups[error_string].append((current_file, line_offset))

    # Sort error strings alphabetically
    sorted_error_strings = sorted(error_groups.keys())

    # Prepare the output lines
    output_lines = []
    group_id = 10  # Start group ID at 10
    for error_string in sorted_error_strings:
        group = error_groups[error_string]
        if len(group) == 1 and error_string != "error_INTERNAL":
            # If there's only one occurrence and it's not error_INTERNAL, don't number it
            filename, line_offset = group[0]
            output_lines.append(f"{filename}:{line_offset}: --{error_string}\n")
        else:
            # Number duplicates or error_INTERNAL
            for offset, (filename, line_offset) in enumerate(group):
                if error_string == "error_INTERNAL" or error_string == "error_PASCAL":
                    # Do not number error_INTERNAL or error_PASCAL
                    output_lines.append(f"{filename}:{line_offset}: --{error_string}\n")
                else:
                    # Append group and offset numbers
                    unique_id = f"(m{group_id:02}{offset})"
                    output_lines.append(f"{filename}:{line_offset}: --{error_string}--    {unique_id}:\n")
            if error_string != "error_INTERNAL" and error_string != "error_PASCAL":
                group_id += 1  # Increment group ID for the next group

    # Write the output to the file
    with open(output_file, "w") as outfile:
        outfile.writelines(output_lines)

    print(f"Processed lines written to {output_file}")

except FileNotFoundError:
    print(f"Error: File '{input_file}' not found.")
except Exception as e:
    print(f"An error occurred: {e}")
