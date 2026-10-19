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
  - kayalar düğmeli gri toplar, çerçeve mor karolar; toplanacak elmaslar yerine kubbe başlı küçük robotlar var (kafaları sağa sola bakar);
  - sabit duvarlar uçları yuvarlak, delikli tek parça kirişler;
  - oyuncu 2,5 saniye durursa çıkış noktasından halka halka yayılan yumuşak bir dalga başlar: her tuğla bütün olarak Z ekseninde ileri geri gider, sabit duvarlar ve çerçeve yerinde kalır (hareket edince söner);
  - açılan çıkış beyaz oklu kırmızı bir karo;
  - kazılan tuğla kendi renginde parçalara, patlamalar rengarenk tuğla parçalarına ayrılır;
  - karakter, kara kasklı, pelerinli ve kırmızı enerji kılıçlı oyuncak figür **Kara Lord**. Robota ulaşınca kılıcını savurur: sıfırdan sentezlenen kılıç sesi, beyaz çekirdekli kırmızı ışıma ve çevreye saçılan kırmızı ışık.

![Mister Mole Sürüm 3](docs/mister-mole-v3.png)

## Özellikler

- **Motor** (`src/engine.ts`): render'dan bağımsız, deterministik TypeScript. Klasik maden oyunlarındaki gibi ızgara her tick'te yukarıdan aşağıya, soldan sağa taranır. Taşlar ve elmaslar düşer, yuvarlak nesnelerin üstünden yuvarlanır. Ateşböcekleri sol duvarı, kelebekler sağ duvarı takip eder. Ayrıca amip, sihirli duvar, 3×3 patlamalar, taş itme ve "yerinde kazma" vardır.
- **Mağaralar** (`src/levels.ts`): klasik oyunlardaki gibi tohumlu rastgele dolgu üzerine çizim komutlarıyla üretilen 6 mağara.
- **Görünüm**: instanced mesh'ler, iki tick arasında yumuşak hareket, gölgeler, bloom, parçacıklar, kafa lambalı madenci, kamera takibi ve sarsıntı. Sesler Web Audio ile sentezlenir. Dokunmatik ekranlar için yön tuşları vardır.

## Kural: bütün elmaslar

Çıkış kapısı, mağaradaki **bütün elmaslar toplanınca** açılır (haritada elmas kalmayınca; kelebek patlamasından çıkacak elmaslar da beklenir). Elmasların sonradan ortaya çıktığı mağaralarda ayrıca mağaranın gerekli sayısı da tutmalıdır. Göstergede toplanan / toplam elmas yazar.

## Çözüm düğmesi

Sağ üstteki **💡 Çözüm** düğmesi (kısayol **H**) üç sürümde de, yalnızca **çözümü olan mağaralarda** ve varsayılan haritada görünür: 1. İlk Kazı, 3. Kelebek Bahçesi, 4. Yeşil Tehdit ve 6. Çığ. Basınca karakterin gideceği yol noktalarla çizilir ve hamleleri kendisi yapar; çözüm bütün elmasları toplar. **■ Durdur** ya da herhangi bir yön tuşu kontrolü oyuncuya geri verir.

- Bu mağaraların başlangıçtan çözümleri önceden hesaplanıp oyuna gömülüdür (`src/solutions.json`, `scripts/make-solutions.ts` üretir). Oyuncu henüz hamle yapmadıysa çözüm anında başlar; zaman geçmişse mağara can kaybetmeden baştan kurulur.
- Mağaranın ortasında basılırsa çözücü (`src/solver.ts`) o andan canlı çözüm arar (ayrı iş parçacığında, en fazla 25 saniye). Oyunun kopyasını motorla adım adım ileri simüle eder; motor belirlenimci olduğu için bulunan hamleler gerçek oyunda aynen oynanınca aynı sonucu verir. Aranan hamleler: en yakın elmasa en kısa yoldan gitmek (her adım simüle edilir, ölümle biten adımlar elenir, yolu kesen düşmandan kaçmak), taş itmek, altındaki toprağı kazarak taş düşürmek (kelebek ezmek, sihirli duvardan elmas almak, gömülü elmasa yol açmak) ve keşif. Arama önce dar başlar, olmazsa elmas sırasını karıştırıp genişleyerek tekrarlar.

Testler, kayıtlı çözümlerin tekrar oynatılınca bütün elmasları toplayıp kazandığını ve çözücünün canlı da çalıştığını doğrular. Mağaralar değişirse kayıtlı çözümler `node --experimental-strip-types scripts/make-solutions.ts` ile yeniden üretilmelidir.

## Harita tohumu

Mağaralar orijinal oyundaki gibi tohumlu rastgele dolgu ile üretilir: aynı tohum her seferinde aynı haritayı verir. Ana menüdeki **Harita tohumu** kutusu:

- **Boş (varsayılan):** her mağara kendi tasarlanmış haritasıyla açılır.
- **Bir sayı:** 1. mağara o sayıyı, sonraki her mağara 101 fazlasını tohum olarak kullanır. Varsayılan tohumlar 101, 202, 303, 404, 505, 606 olduğu için **101** girmek varsayılan haritaları verir. Aynı sayıyı giren herkes aynı haritaları alır.
- **🎲** rastgele bir tohum seçer, **Varsayılan** geri döner. Seçim tarayıcıda hatırlanır; duraklatma menüsünde o mağaranın tohumu görünür.

Başka bir tohum yeterli elmas vermezse eksik elmaslar rastgele toprak hücrelere eklenir, böylece her harita bitirilebilir kalır.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| Ok tuşları / WASD | Hareket |
| Shift + yön | Yerinden kıpırdamadan kaz veya al |
| Esc | Sıkışınca mağarayı baştan al (bir can gider). Telefonda üstteki ↺ düğmesi |
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
