# Taş Avcısı 3B

<p align="center"><b>Demo:</b> <a href="https://billylz.github.io/r3f-boulder-3dash/">https://billylz.github.io/r3f-boulder-3dash/</a></p>

Klasik *Boulder Dash* oyununun kurallarını izleyen, React Three Fiber ile yazılmış 3B bir maden oyunu. Grafikler, sesler ve mağaralar bu projeye özgüdür; orijinal oyundan hiçbir varlık kopyalanmamıştır.

![Taş Avcısı 3B](docs/tas-avcisi.png)

## Özellikler

- **Motor** (`src/engine.ts`): render'dan bağımsız, deterministik TypeScript. Orijinaldeki gibi ızgara her tick'te yukarıdan aşağıya, soldan sağa taranır. Taşlar ve elmaslar düşer, yuvarlak nesnelerin üstünden yuvarlanır. Ateşböcekleri sol duvarı, kelebekler sağ duvarı takip eder. Ayrıca amip, sihirli duvar, 3×3 patlamalar, taş itme ve "yerinde kazma" vardır.
- **Mağaralar** (`src/levels.ts`): orijinal oyundaki gibi tohumlu rastgele dolgu üzerine çizim komutlarıyla üretilen 6 mağara.
- **Görünüm**: instanced mesh'ler, iki tick arasında yumuşak hareket, gölgeler, bloom, parçacıklar, kafa lambalı madenci, kamera takibi ve sarsıntı. Sesler Web Audio ile sentezlenir. Dokunmatik ekranlar için yön tuşları vardır.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| Ok tuşları / WASD | Hareket |
| Shift + yön | Yerinden kıpırdamadan kaz veya al |
| Esc | Sıkışınca mağarayı baştan al (bir can gider) |
| P | Duraklat |
| V | Genel görünüm |
| M | Ses aç/kapat |
| Fare tekerleği | Yakınlaştır/uzaklaştır |

## Çalıştırma

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # oyun kuralları ve mağara kontrolleri
npm run build
```

Testler (`scripts/check-boulder.ts`) düşme, yuvarlanma, ezilme, toplama, itme, düşman hareketi, kelebek elmasları, sihirli duvar, amip ve süre kurallarını kontrol eder. Her mağara için de gerekli elmas sayısına ulaşılabildiğini, düşmanların kendiliğinden ölmediğini ve rastgele oynanışta çökme olmadığını doğrular.

## Demo yayını (GitHub Pages)

`.github/workflows/pages.yml` her push'ta testleri çalıştırır ve projeyi derler. Varsayılan dala yapılan push'larda `dist/` klasörünü GitHub Pages'e yayınlar. Bunun için **Settings → Pages → Source: GitHub Actions** seçilmelidir.
