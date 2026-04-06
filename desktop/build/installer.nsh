; Valnaa dark theme for NSIS installer
!macro customHeader
  !define MUI_BGCOLOR "18181B"
  !define MUI_TEXTCOLOR "FAFAFA"
  !define MUI_INSTFILESPAGE_COLORS "FAFAFA 18181B"
  !define MUI_INSTFILESPAGE_PROGRESSBAR_COLORS "A855F7 18181B"
!macroend

!macro customInit
  ; Set dark background color on the installer window
  SetBrandingImage /IMGID=1046 /RESIZETOFIT ""
!macroend
