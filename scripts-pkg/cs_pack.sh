#!/bin/bash
SCRIPT=${0##*/}
SCRIPT_VERSION="2.0"

# Executable naming convention (v2.0):
#   Primary executable: pnut-ts (hyphenated, matches project name)
#   Compatibility symlink: pnut_ts -> pnut-ts (underscored, for backward compatibility)

# Check that we are in desired directory
if [ "${PWD##*/}" != "DIST" ]; then
   echo "${SCRIPT}: ERROR: this script must be from from PropV2-Shared/.../DIST folder! Aborted"
   exit 1;
fi

pkg_src_folder="_pkgs"
extras_dist_folder="_dist"
build_folder="_unzipped"
old_src_name="pnut-ts.js"
primary_exe_name="pnut-ts"
compat_link_name="pnut_ts"

if [ -f ${pkg_src_folder}/${old_src_name} ]; then
        mv ${pkg_src_folder}/${old_src_name} ${pkg_src_folder}/${primary_exe_name}
        (set -x;codesign --verbose=4 --options=runtime -s "Developer ID Application: Iron Sheep Productions, LLC (T67FW2JCJW)" ${pkg_src_folder}/${primary_exe_name})
fi
(set -x;codesign --verbose=4 --options=runtime -s "Developer ID Application: Iron Sheep Productions, LLC (T67FW2JCJW)" ${pkg_src_folder}/p2-pnut-ts-macos-arm64)
(set -x;codesign --verbose=4 --options=runtime -s "Developer ID Application: Iron Sheep Productions, LLC (T67FW2JCJW)" ${pkg_src_folder}/p2-pnut-ts-macos-x64)
if [ -d ${pkg_src_folder}/prebuilds ]; then
        (set -x;codesign --verbose=4 --options=runtime -s "Developer ID Application: Iron Sheep Productions, LLC (T67FW2JCJW)" ${pkg_src_folder}/prebuilds/darwin-x64+arm64/node.napi.node)
fi

# prepare macos x64
dist_folder="${build_folder}/macos/macos-x64"
mkdir -p ${dist_folder}/pnut_ts
rm -rf ${dist_folder}/*
(set -x;cp -p ${pkg_src_folder}/${primary_exe_name} ${dist_folder}/pnut_ts/${primary_exe_name})
(set -x;ln -sf ${primary_exe_name} ${dist_folder}/pnut_ts/${compat_link_name})
(set -x;cp -rp ${pkg_src_folder}/ext ${dist_folder}/pnut_ts)
(set -x;cp -p ${extras_dist_folder}/* ${dist_folder}/pnut_ts)

# prepare macos arm64
dist_folder="${build_folder}/macos/macos-arm64"
rm -rf ${dist_folder}/*
mkdir -p ${dist_folder}/pnut_ts
(set -x;cp -p ${pkg_src_folder}/${primary_exe_name} ${dist_folder}/pnut_ts/${primary_exe_name})
(set -x;ln -sf ${primary_exe_name} ${dist_folder}/pnut_ts/${compat_link_name})
(set -x;cp -rp ${pkg_src_folder}/ext ${dist_folder}/pnut_ts)
(set -x;cp -p ${extras_dist_folder}/* ${dist_folder}/pnut_ts)

# prepare Windows x64
dist_folder="${build_folder}/win/win-x64"
rm -rf ${dist_folder}/*
mkdir -p ${dist_folder}/pnut_ts
(set -x;cp -p ${pkg_src_folder}/p2-pnut-ts-win-x64.exe ${dist_folder}/pnut_ts/${primary_exe_name}.exe)
(set -x;cp -p ${dist_folder}/pnut_ts/${primary_exe_name}.exe ${dist_folder}/pnut_ts/${compat_link_name}.exe)
(set -x;cp -p ${extras_dist_folder}/* ${dist_folder}/pnut_ts)

# prepare Windows arm64
dist_folder="${build_folder}/win/win-arm64"
rm -rf ${dist_folder}/*
mkdir -p ${dist_folder}/pnut_ts
(set -x;cp -p ${pkg_src_folder}/p2-pnut-ts-win-arm64.exe ${dist_folder}/pnut_ts/${primary_exe_name}.exe)
(set -x;cp -p ${dist_folder}/pnut_ts/${primary_exe_name}.exe ${dist_folder}/pnut_ts/${compat_link_name}.exe)
(set -x;cp -p ${extras_dist_folder}/* ${dist_folder}/pnut_ts)

# prepare Linux x64
dist_folder="${build_folder}/linux/linux-x64"
rm -rf ${dist_folder}/*
mkdir -p ${dist_folder}/pnut_ts
(set -x;cp -p ${pkg_src_folder}/p2-pnut-ts-linux-x64 ${dist_folder}/pnut_ts/${primary_exe_name})
(set -x;ln -sf ${primary_exe_name} ${dist_folder}/pnut_ts/${compat_link_name})
(set -x;cp -p ${extras_dist_folder}/* ${dist_folder}/pnut_ts)

# prepare Linux arm64
dist_folder="${build_folder}/linux/linux-arm64"
rm -rf ${dist_folder}/*
mkdir -p ${dist_folder}/pnut_ts
(set -x;cp -p ${pkg_src_folder}/p2-pnut-ts-linux-arm64 ${dist_folder}/pnut_ts/${primary_exe_name})
(set -x;ln -sf ${primary_exe_name} ${dist_folder}/pnut_ts/${compat_link_name})
(set -x;cp -p ${extras_dist_folder}/* ${dist_folder}/pnut_ts)

echo ${SCRIPT}: "Packing done!"
echo "  Primary executable: ${primary_exe_name}"
echo "  Compatibility link: ${compat_link_name} -> ${primary_exe_name}"
