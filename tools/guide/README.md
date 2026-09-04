# tools/guide/ — 운영 가이드북 만들기

`안내자료/스마트점핑 운영 가이드북.html` 과 `.pdf`(A4 30쪽)를 만드는 자리입니다.
화면을 말로 설명하지 않고 **실제 사이트를 캡처해 번호를 찍어** 짚습니다.

## 한 번에 다시 만들기

```
npm run serve          # 8790 에 사이트를 띄워 둔다 (다른 창에서 계속 실행)
npm run guide:shots    # 캡처 → WebP  (Chrome + puppeteer-core + sharp 필요)
npm run guide:measure  # 콜아웃 좌표 재측정 → centers.json
npm run guide          # HTML + PDF
```

글만 고쳤다면 `npm run guide` 하나면 됩니다. 캡처는 사이트 화면이 바뀌었을 때만
다시 찍습니다.

`puppeteer-core` 와 `sharp` 는 선택 의존성입니다. 캡처·PDF 를 돌리려면
`npm i -D puppeteer-core sharp` 를 한 번 해 두세요. 크롬이 다른 곳에 깔려 있으면
`CHROME_PATH` 환경변수로 알려 줍니다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `template.html` | 가이드북 본문. 그림 자리는 `__IMG_01__` 같은 자리표시자로 비워 둔다 |
| `capture.js` | 로그인 상태·경로를 바꿔 가며 1440×900 2배율로 화면을 찍어 `raw/` 에 담는다 |
| `capture-extra.js` | 모달 안에서만 그려지는 수업 리포트, 카드 근접 컷 등 보완 캡처 |
| `optimize.js` | `raw/*.png` → 가로 1400px WebP (`shots/`). 원본은 저장소에 올리지 않는다 |
| `measure.js` | 콜아웃이 가리킬 요소의 중심을 %로 재서 `centers.json` 에 적는다 |
| `build.js` | 자리표시자에 그림을 base64 로 박아 단일 HTML 로 굽는다 |
| `pdf.js` | 그 HTML 을 인쇄용 CSS 그대로 A4 PDF 로 뽑는다 |
| `shots/*.webp` | 가이드북에 실린 그림 34장 (약 930KB) |
| `centers.json` | 측정한 좌표. 콜아웃을 새로 찍을 때 여기 값을 쓴다 |

## 콜아웃 좌표는 눈대중으로 찍지 않는다

번호 뱃지(`<span class="cal" style="left:…%;top:…%">`)는 `.shot` 기준 백분율입니다.
컨테이너 한가운데를 찍으면 엉뚱한 데를 가리킵니다 — 칩 목록처럼 가운데 정렬된
줄에서는 "왼쪽 부분"이 45.9% 이지 24% 가 아닙니다. 그래서 `measure.js` 로
**가리키려는 그 요소**의 중심을 직접 재서 씁니다.

캡처와 측정은 반드시 같은 뷰포트(1440×900, deviceScaleFactor 2)에서 돌아야
좌표가 맞습니다. 두 스크립트에 같은 값이 박혀 있습니다.

## 인쇄 지면에서 주의할 것

- A4 본문 폭은 약 695 CSS px 이라 `@media (max-width:900px)` 가 **인쇄에서도 걸립니다.**
  2단·3단 배치가 1단으로 풀려 버리므로 `@media print` 에서 되돌립니다.
- 세로로 긴 캡처(사이드바)는 폭에 맞추면 한 장이 세 쪽을 잡아먹습니다.
  `build.js` 가 WebP 헤더에서 실제 비율을 읽어 높이가 200mm 를 넘지 않는
  폭을 계산해 `.shot` 에 `--pw` 로 박아 둡니다.
- `.shot.narrow` / `.shot.mid` 가 명시도로 앞서므로 인쇄 규칙에도 같이 적어야 합니다.
