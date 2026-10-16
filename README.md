# Mister Mole

<p align="center"><b>Demo:</b> <a href="https://billylz.github.io/r3f-mister-mole/">https://billylz.github.io/r3f-mister-mole/</a></p>

1980'lerin klasik maden oyunlarından esinlenen, React Three Fiber ile yazılmış 3B bir maden oyunu. Grafikler, sesler ve mağaralar bu projeye özgüdür; hiçbir oyundan varlık kopyalanmamıştır.

![Mister Mole](docs/mister-mole.png)

## Sürümler

Ana menüden üç görünüm arasında seçim yapılır; seçim tarayıcıda hatırlanır. Oyun kuralları ve mağaralar tüm sürümlerde aynıdır.

- **Sürüm 1 · Klasik:** aydınlık mağara, blok toprak, madenci karakter.
- **Sürüm 2 · Modern** (`src/v2/`): karanlık mağara. Işığı köstebeğin gölge düşüren kafa lambası, elmaslar, ateşböcekleri ve patlamalar verir. Ayrıca:
  - birbirine kaynayan organik toprak, bazalt sütunlar, pırlanta kesimli yanardöner elmaslar;
  - havada süzülen toz zerreleri, patlamada şok dalgası ve kısa ağır çekim;
  - düşen nesnelerde esneme-sıkışma, ileriye bakan kamera, telefonda titreşim;
  - elmas ilerleme halkası ve süre azalınca kırmızı nabız atan ekran kenarları.

![Mister Mole Sürüm 2](docs/mister-mole-v2.png)

- **Sürüm 3 · Oyuncak tuğla** (`src/v3/`): aydınlık mor sahne ve canlı renkli, düğmeli plastik tuğlalar. Ayrıca:
  - kayalar düğmeli gri toplar, elmaslar kristal mücevherler, çerçeve mor karolar;
  - sabit duvarlar uçları yuvarlak, delikli tek parça kirişler;
  - açılan çıkış beyaz oklu kırmızı bir karo;
  - kazılan tuğla kendi renginde parçalara, patlamalar rengarenk tuğla parçalarına ayrılır;
  - karakter, kara kasklı, pelerinli ve kırmızı enerji kılıçlı oyuncak figür **Kara Lord**.

![Mister Mole Sürüm 3](docs/mister-mole-v3.png)

## Özellikler

- **Motor** (`src/engine.ts`): render'dan bağımsız, deterministik TypeScript. Klasik maden oyunlarındaki gibi ızgara her tick'te yukarıdan aşağıya, soldan sağa taranır. Taşlar ve elmaslar düşer, yuvarlak nesnelerin üstünden yuvarlanır. Ateşböcekleri sol duvarı, kelebekler sağ duvarı takip eder. Ayrıca amip, sihirli duvar, 3×3 patlamalar, taş itme ve "yerinde kazma" vardır.
- **Mağaralar** (`src/levels.ts`): klasik oyunlardaki gibi tohumlu rastgele dolgu üzerine çizim komutlarıyla üretilen 6 mağara.
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

Testler (`scripts/check-game.ts`) düşme, yuvarlanma, ezilme, toplama, itme, düşman hareketi, kelebek elmasları, sihirli duvar, amip ve süre kurallarını kontrol eder. Her mağara için de gerekli elmas sayısına ulaşılabildiğini, düşmanların kendiliğinden ölmediğini ve rastgele oynanışta çökme olmadığını doğrular.

## Demo yayını (GitHub Pages)

`.github/workflows/pages.yml` her push'ta testleri çalıştırır ve projeyi derler. Varsayılan dala yapılan push'larda `dist/` klasörünü GitHub Pages'e yayınlar. Bunun için **Settings → Pages → Source: GitHub Actions** seçilmelidir.
