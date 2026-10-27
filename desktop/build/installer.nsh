; The download link names the installer SmartCampus-Setup-<KEY>.exe. Save that name
; next to the app so it can activate itself on first start.
!macro customInstall
  FileOpen $0 "$INSTDIR\installer-name.txt" w
  FileWrite $0 "$EXEFILE"
  FileClose $0
!macroend

; Uninstall forgets the activation (a reinstall asks for a key again) but keeps the
; local data, so unsynced changes are sent once the app is activated again.
; Updates (installing a newer version over this one) keep the activation.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$APPDATA\Smart Campus ERP\license.json"
  ${endIf}
!macroend
