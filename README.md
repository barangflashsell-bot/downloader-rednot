# rednote-telegram-downloader

Telegram Bot Downloader khusus Xiaohongshu / RedNote yang dibangun dengan TypeScript dan dioptimalkan untuk Vercel Serverless Functions menggunakan Telegram Webhook.

---

## Tahap 4 — Media Downloader & Persistent Storage

Pada tahap ini, modul streaming downloader dan persistent object storage telah diimplementasikan:
- ✅ **Storage Abstraction Layer**: Antarmuka `StorageAdapter` netral vendor (`upload`, `getUrl`, `exists`, `delete` manual untuk admin).
- ✅ **Vercel Blob Implementation**: `VercelBlobStorageAdapter` menggunakan `@vercel/blob` dengan konfigurasi `BLOB_READ_WRITE_TOKEN`.
- ✅ **Deterministic Object Key**: Format aman `rednote/<safePostId>/<sha256Hash>.<safeExtension>`, tahan terhadap serangan *path traversal*.
- ✅ **Streaming HTTP Downloader**: Menggunakan stream chunk-by-chunk tanpa mengumpulkan file besar di memory RAM.
- ✅ **File Size Protection**: Validasi awal via `Content-Length` dan proteksi penghitung byte streaming secara real-time (`MAX_FILE_SIZE_MB=50`).
- ✅ **Content-Type Validation**: Menerima format media valid (`video/mp4`, `video/quicktime`, `video/webm`, `image/jpeg`, `image/png`, `image/webp`), menolak `text/html` atau respon error/WAF.
- ✅ **Redirect & SSRF Security**: Menolak host lokal (`localhost`, `127.0.0.1`, IP private) dan memvalidasi setiap hop redirect dengan batas maksimal 5 hop.
- ✅ **Deduplication Check**: Memeriksa keberadaan file di storage sebelum download untuk menghemat bandwidth.
- ✅ **Clean Temporary Processing**: Pembersihan file sementara (`.tmp`) secara terjamin melalui blok `try/finally`.
- ✅ **Permanent Storage (NO Auto-Delete)**: Tidak ada TTL, cron, atau auto-delete. Media tersimpan secara permanen.
- ✅ **Telegram-Ready Service Layer**: `processRednoteMedia()` yang mengoordinasikan ekstraksi dan pengunduhan dengan penentuan `deliveryMode` (`telegram` vs `link`).
- ✅ **Test-Only Memory Adapter**: `MemoryStorageAdapter` untuk pengujian unit 100% offline tanpa membutuhkan kredensial Vercel.

---

## Struktur Direktori

```text
rednote-telegram-downloader/
├── api/
│   ├── health.ts                 # GET /api/health - Health check endpoint
│   └── telegram.ts               # POST /api/telegram - Webhook handler endpoint
├── scripts/
│   ├── set-webhook.ts            # Skrip registrasi webhook ke Telegram Bot API
│   ├── get-webhook-info.ts       # Skrip inspeksi status webhook
│   ├── delete-webhook.ts         # Skrip penghapusan manual webhook
│   └── test-live-extraction.ts   # Skrip pengujian ekstraksi URL live
├── src/
│   ├── bot/
│   │   └── bot.ts                # Inisialisasi bot grammY, commands, dan error handling
│   ├── downloader/
│   │   ├── download.ts           # Streaming downloader downloadAndStoreMedia()
│   │   ├── errors.ts             # Typed downloader errors
│   │   └── types.ts              # DownloadOptions dan DownloadResult
│   ├── media/
│   │   └── media-service.ts      # Service layer processRednoteMedia()
│   ├── rednote/
│   │   ├── errors.ts             # Typed extractor error classes
│   │   ├── extractor.ts          # Orchestrator extractRednote()
│   │   ├── media-validator.ts    # Validasi keamanan media & anti-SSRF
│   │   ├── parser.ts             # Pure HTML/SSR parser parseRednoteHtml()
│   │   ├── resolver.ts           # Short URL resolver resolveRednoteUrl()
│   │   └── types.ts              # Interface RednotePost dan RednoteMedia
│   ├── storage/
│   │   ├── storage.ts            # Key generator generateStorageKey() & factory
│   │   ├── types.ts              # StorageAdapter dan StorageMetadata interfaces
│   │   └── vercel-blob.ts        # Implementasi Vercel Blob adapter
│   └── utils/
│       └── url.ts                # Utility validasi URL RedNote
├── tests/
│   ├── fixtures/                 # HTML fixtures realistis untuk offline test
│   │   ├── rednote-video.html
│   │   ├── rednote-image.html
│   │   ├── rednote-gallery.html
│   │   ├── rednote-no-media.html
│   │   └── rednote-malformed.html
│   ├── mocks/
│   │   └── memory-storage.ts     # In-memory storage adapter khusus testing
│   ├── bot.test.ts               # Unit test bot grammY
│   ├── downloader.test.ts        # Unit test streaming downloader (16 skenario)
│   ├── extractor.test.ts         # Unit test extractor pipeline
│   ├── media-service.test.ts     # Unit test service layer
│   ├── media-validator.test.ts   # Unit test media allowlist & security
│   ├── parser.test.ts            # Unit test offline parser HTML
│   ├── resolver.test.ts          # Unit test mock URL resolver
│   ├── storage.test.ts           # Unit test storage keys & adapters
│   ├── url.test.ts               # Unit test isRednoteUrl()
│   └── webhook.test.ts           # Unit test webhook authorization
├── .env.example                  # Template environment variables
├── .gitignore                    # Git ignore rules
├── eslint.config.mjs             # Konfigurasi ESLint
├── package.json                  # Dependencies & npm scripts
├── tsconfig.json                 # Konfigurasi TypeScript strict mode
├── vercel.json                   # Konfigurasi Vercel
└── README.md                     # Dokumentasi project
```

---

## REDNOTE EXTRACTOR DETAILS

### 1. URL yang Didukung
- `https://www.xiaohongshu.com/explore/:id`
- `https://xiaohongshu.com/explore/:id`
- `https://www.xiaohongshu.com/discovery/item/:id`
- `https://xhslink.com/:code`
- `https://www.xhslink.com/:code`

### 2. Kebijakan Konten Publik Saja
Extractor dirancang khusus untuk memproses postingan yang **terbuka untuk publik tanpa login**:
- Tidak meminta username/password atau session cookie user.
- Tidak membypass CAPTCHA, access control, atau anti-bot protection.
- Jika konten memerlukan login atau terhalang verifikasi, sistem melempar `RednoteAccessError` secara transparan dan jujur.

### 3. Deteksi Media Video & Gambar
- **Video**: Mengambil direct stream URL dari manifest media SSR atau Open Graph metadata.
- **Image / Gallery**: Mengambil seluruh array gambar resolusi penuh yang disediakan oleh post publik, menjaga urutan dan mendeduplikasi URL ganda.
- **Tanpa Watermark Palsu**: Mengambil direct CDN URL asli yang disediakan oleh platform tanpa manipulasi frame/blur/crop buatan.

### 4. Keterbatasan (Platform Limitations)
Keberhasilan ekstraksi live bergantung pada ketersediaan halaman publik Xiaohongshu saat request dijalankan:
- Jika IP server diblokir oleh anti-bot Xiaohongshu (WAF / slide verification), sistem akan melempar `RednoteAccessError`.
- Postingan privat atau yang sudah dihapus akan mengembalikan `RednoteAccessError`.
- Postingan tanpa media video/gambar akan mengembalikan `RednoteMediaNotFoundError`.

---

## Panduan Penggunaan

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Salin template konfigurasi:
```bash
cp .env.example .env
```
Variabel yang digunakan:
```env
BOT_TOKEN=                       # Token bot dari @BotFather
WEBHOOK_SECRET=                  # Secret token acak untuk webhook Telegram
WEBHOOK_URL=                     # URL publik endpoint Telegram di Vercel
ADMIN_USER_IDS=                  # ID admin Telegram (opsional)

MAX_FILE_SIZE_MB=50
REQUEST_TIMEOUT_MS=15000
MAX_REDIRECTS=5
RATE_LIMIT_PER_MINUTE=3
```

### 3. Menjalankan Unit Test (Offline)
Semua unit test berjalan secara offline tanpa memerlukan internet menggunakan fixture:
```bash
npm test
```

### 4. Menjalankan Pengujian Ekstraksi Live (Opsional)
Untuk menguji ekstraksi langsung dari tautan publik RedNote:
```bash
npm run test:rednote:live <URL_REDNOTE>

# Contoh:
npm run test:rednote:live https://www.xiaohongshu.com/explore/65a000000000000001000001
```

### 5. Build, Lint & Type-Check
```bash
npm run build
npm run type-check
npm run lint
```

### 6. Deployment ke Vercel & Pendaftaran Webhook
```bash
# 1. Deploy
npx vercel

# 2. Atur BOT_TOKEN & WEBHOOK_SECRET di Vercel Dashboard

# 3. Daftarkan webhook Telegram
npm run webhook:set

# 4. Periksa info webhook
npm run webhook:info
```
