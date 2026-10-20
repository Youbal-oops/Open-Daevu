; Extra steps for the uninstaller. An update runs the old uninstaller silently, so none of this happens then.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Start with Windows, and the link handler, are removed on the way out.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Daevu"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Research Workspace"
    DeleteRegKey HKCU "Software\Classes\rw"
    ; The person decides about data on this computer. A Google Drive folder is never touched either way.
    ; Started from inside the app, the choice was already made there.
    IfFileExists "$APPDATA\Daevu\uninstall-wipe" wipeAll
    IfFileExists "$APPDATA\Daevu\uninstall-keep" keepData
    MessageBox MB_YESNO|MB_ICONQUESTION "Remove everything Daevu keeps on this computer?$\r$\n$\r$\nYes: settings, saved sign-ins and any workspace stored here are deleted.$\r$\nNo: only caches and saved sign-ins are deleted. Your workspace here stays.$\r$\n$\r$\nYour Google Drive folder is never touched." /SD IDNO IDYES wipeAll
    keepData:
      Delete "$APPDATA\Daevu\uninstall-keep"
      RMDir /r "$APPDATA\Daevu\auth"
      RMDir /r "$APPDATA\Daevu\Cache"
      RMDir /r "$APPDATA\Daevu\Code Cache"
      RMDir /r "$APPDATA\Daevu\GPUCache"
      RMDir /r "$APPDATA\Daevu\databases"
      RMDir /r "$APPDATA\Daevu\plugins"
      RMDir /r "$APPDATA\Daevu\web-chat-drafts"
      RMDir /r "$APPDATA\Daevu\app-icons"
      RMDir /r "$APPDATA\Daevu\shared-cache"
      RMDir /r "$APPDATA\Research Workspace\auth"
      RMDir /r "$APPDATA\Research Workspace\Cache"
      RMDir /r "$APPDATA\Research Workspace\Code Cache"
      RMDir /r "$APPDATA\Research Workspace\GPUCache"
      RMDir /r "$APPDATA\Research Workspace\databases"
      RMDir /r "$APPDATA\Research Workspace\plugins"
      RMDir /r "$APPDATA\Research Workspace\web-chat-drafts"
      RMDir /r "$APPDATA\Research Workspace\app-icons"
      RMDir /r "$APPDATA\Research Workspace\shared-cache"
      Goto wipeDone
    wipeAll:
      RMDir /r "$APPDATA\Daevu"
      RMDir /r "$APPDATA\Research Workspace"
    wipeDone:
  ${endIf}
!macroend
