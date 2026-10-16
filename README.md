# bgpyouso

```
index.html   上傳頁 + 報告
youso.js     名單解析、比對、匯出檔解析、報告 HTML；node youso.js --demo 自我檢查
bands.txt    樂團與角色關鍵字（網頁底部「關鍵字」可改，存在瀏覽器 localStorage）
photos.txt   正式名=圖片網址：45 位角色立繪 + 9 個團 logo，直接引用官網圖，不下載
```

## 用法

```sh
python3 -m http.server 8000      # 本機看：http://localhost:8000 ；加 ?demo 看假資料版面
node youso.js --demo             # 自我檢查
```

用戶端：Threads App → 設定 → 帳號中心 → 你的資訊和權限 → 下載你的資訊 → 選 Threads、**JSON**、全部日期 → 收到 zip 後整包丟進頁面。
