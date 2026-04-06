; Valnaa dark theme for NSIS installer
; MUI_BGCOLOR is already defined by electron-builder — redefine it
!macro customHeader
  !ifdef MUI_BGCOLOR
    !undef MUI_BGCOLOR
  !endif
  !define MUI_BGCOLOR "18181B"

  !ifdef MUI_TEXTCOLOR
    !undef MUI_TEXTCOLOR
  !endif
  !define MUI_TEXTCOLOR "FAFAFA"

  !define MUI_INSTFILESPAGE_COLORS "FAFAFA 18181B"
!macroend
