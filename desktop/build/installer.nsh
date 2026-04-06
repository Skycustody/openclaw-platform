; Valnaa dark theme for NSIS installer
; electron-builder pre-defines several MUI constants — undef all before redefining
!macro customHeader
  !ifdef MUI_BGCOLOR
    !undef MUI_BGCOLOR
  !endif
  !define MUI_BGCOLOR "18181B"

  !ifdef MUI_TEXTCOLOR
    !undef MUI_TEXTCOLOR
  !endif
  !define MUI_TEXTCOLOR "FAFAFA"

  !ifdef MUI_INSTFILESPAGE_COLORS
    !undef MUI_INSTFILESPAGE_COLORS
  !endif
  !define MUI_INSTFILESPAGE_COLORS "FAFAFA 18181B"

  !ifdef MUI_INSTFILESPAGE_PROGRESSBAR_COLORS
    !undef MUI_INSTFILESPAGE_PROGRESSBAR_COLORS
  !endif
!macroend
