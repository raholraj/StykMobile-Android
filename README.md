# StykMobile-Android

StykAnimate Android (Capacitor) wrapper — GitHub Actions se APK banao.

## APK kaise banaye (sabse aasan tarika)

1. **Is repo me full project upload karo**  
   - Neeche **Add file → Upload files** pe click karo  
   - Ya ZIP extract karke `StykAnimate-App-main` ke **andar ke saare files/folders** (`.github`, `mobile`, `src`, `package.json` etc.) yahan drag-and-drop kar do  
   - Commit message: `Add full Styk Mobile project`  
   - Commit to `main`

2. **Actions se build**  
   - Repo → **Actions** tab  
   - Left side **Android APK** workflow select karo  
   - **Run workflow** → **Run workflow** button  
   - 10–15 minute wait karo  
   - Run complete hone ke baad neeche **Artifacts** me **styk-mobile-apk** download karo  
   - ZIP kholo → `app-debug.apk` phone pe install karo

## Important
- Workflow pehle se ready hai (`.github/workflows/android-apk.yml`) — koi yml change nahi karna padega.
- Debug APK hai. Play Store ke liye release signing alag se setup karna hoga.
- License: StykAnimate GPL-3.0 — source share karna hoga agar APK do.

Repo: https://github.com/raholraj/StykMobile-Android
