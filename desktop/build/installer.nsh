; The download link names the installer SmartCampus-Setup-<KEY>.exe. Save that name
; next to the app so it can activate itself on first start.
!macro customInstall
  FileOpen $0 "$INSTDIR\installer-name.txt" w
  FileWrite $0 "$EXEFILE"
  FileClose $0
!macroend
