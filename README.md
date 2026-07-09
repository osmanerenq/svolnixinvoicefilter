# Svolnix Invoice Filter & Nixie AI Analysis (Tauri v2 + React)

Bu masaüstü uygulaması; PDF ve Excel faturalarını yüksek hızda tarayan, fatura detaylarına (düzenleyen, alıcı, vergi numarası, tutar, tarih) göre filtreleyen/gruplayan ve **Nixie AI (Yapay Zeka)** yardımıyla faturalarınızı derinlemesine analiz eden gelişmiş bir fatura yönetim sistemidir.

> [!NOTE]
> **🤖 Geliştirici Notu:** Bu uygulamanın mimarisi, hata çözümleri, performansa yönelik akıllı iki aşamalı sorgulama mekanizması ve gelişmiş özellikleri **GLM 5.2, DeepSeek ve Gemini** yapay zeka modellerinin yardımıyla tasarlanmış ve geliştirilmiştir.

---

## 🌟 Önemli Özellikler (Kullanıcılar İçin)

- **Yüksek Performanslı Tarama:** Rust tabanlı tarayıcı motoru sayesinde yüzlerce PDF ve Excel faturasını milisaniyeler içinde okur ve arayüze yükler.
- **Nixie AI ile Fatura Sohbeti:**
  - Alt kısımdaki **"Nixie AI'ya Soru Sor"** paneliyle faturalarınız hakkında serbestçe sohbet edebilir, genel bilgileri sorgulayabilir veya Excel raporları oluşturabilirsiniz.
  - Örneğin: *"Bana 2026 yılındaki tüm bilgisayar/kamera alımları için detaylı bir ürün listesi Excel'i çıkar."*
- **Claude Tarzı Sihirbaz Soruları:** Excel veya rapor çıktısı oluşturulurken AI, kriterlerinizi netleştirmek amacıyla çoktan seçmeli interaktif sihirbaz soruları sorar.
- **Hızlı ve Akıllı Çalışma Şeması:** 
  - Genel ve basit sorularınız fatura detayları yüklenmeden **2 saniye içinde** cevaplanır.
  - Detaylı ürün analizi gerektiğinde AI otomatik olarak ham PDF içeriklerini yükler (büyük token tasarrufu ve hız artışı).
  - Güvenlik sınırı: 300'den fazla fatura taranmaya çalışıldığında sistem sizi otomatik uyararak korur.
- **Yerel Yapay Zeka Belleği (Kategori Öğrenme):**
  - Faturaları elle kategorize ettiğinizde (örneğin "Yemek", "Kırtasiye"), bu tercihleriniz yerel bir vektör tabanında (`trained_categories.json`) saklanır ve sonraki faturalarda AI tarafından otomatik uygulanır.
- **Akıllı Klasörleme ve Excel Çıktısı:**
  - Filtrelediğiniz faturaları düzenleyen şirket, alıcı veya tarihe göre bilgisayarınızda otomatik olarak klasörleyebilir veya AI tarafından hazırlanan Excel tablolarını doğrudan `.xlsx` olarak kaydedebilirsiniz.

---

## 🛠️ Teknoloji Yığını (Geliştiriciler İçin)

- **Frontend (Arayüz):** React, TypeScript, Vite, Zustand (State Management), Tailwind CSS, Lucide Icons.
- **Backend (Masaüstü):** Tauri v2, Rust (Tokio & Parser kütüphaneleri).
- **Yapay Zeka:**
  - **Local Embedding Engine** (ONNX / Ort) yerel kategori benzerliği hesaplamaları için.
  - **DeepSeek API** & **OpenAI / Claude Uyumlu API** entegrasyonu.
  - **rust_xlsxwriter** kütüphanesi ile Rust tarafında native Excel (.xlsx) derleme.

---

## 📂 Dosya Yapısı & İş Akışı

- `src-tauri/src/parser.rs`: PDF ve Excel faturasındaki şablonları Regex ve desen tarayıcılar yardımıyla yüksek hızda parse eder.
- `src-tauri/src/memory.rs`: Vektör tabanlı kategori öğrenmesini yönetir.
- `src-tauri/src/lib.rs`: Tauri komut işleyicilerini ve iki aşamalı Nixie AI (`deep_analyze`) pipeline motorunu barındırır.
- `src/FilterPanel.tsx`: Nixie AI sohbet panelini, Claude tarzı sihirbaz modalını ve radar animasyonlu tarama ekranını barındıran React bileşenidir.

---

## 🚀 Kurulum ve Çalıştırma (Geliştiriciler İçin)

### Gereksinimler
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (Tauri derlemesi için)
- [Node.js](https://nodejs.org/) (Frontend paketleri için)

### Adımlar

1. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```

2. **Geliştirme Modunda Çalıştırın (Development):**
   ```bash
   npm run tauri dev
   ```

3. **Üretim Sürümü Derleyin (Build Production):**
   ```bash
   npm run tauri build
   ```

---

## 💡 İpuçları ve Kullanım

- **AI Ayarları:** Sağ üstteki dişli çark simgesine tıklayarak DeepSeek API anahtarınızı girin ve AI modelinizi seçin.
- **CPU Düzeltme:** OCR okuması sırasında şirket unvanları yarım çıktıysa (örn. Ltd. Şti yerine sadece ŞTİ yazdıysa), faturanın sonundaki **CPU (AI ile Düzelt)** butonunu kullanarak yapay zeka ile otomatik düzelttirebilirsiniz.
