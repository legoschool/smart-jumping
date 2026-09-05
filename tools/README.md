# tools/ — 개발 도구

저장소 루트에서 `npm run <명령>` 으로 실행합니다. 처음 한 번만 `npm install`.

| 명령 | 하는 일 | 언제 쓰나 |
|---|---|---|
| `npm test` | Apps Script 백엔드를 흉내 낸 환경에서 통합 테스트 125건 | **코드 고칠 때마다** |
| `npm run build` | `apps-script/` 를 합쳐 루트 `index.html` (GitHub Pages용) 생성 | 프론트·데이터를 고친 뒤 **반드시** |
| `npm run xlsx` | `스마트점핑_DB.xlsx` 재생성 (구글 시트 가져오기용) | 시드·스키마를 고친 뒤 |
| `node tools/gen-chars.js` | `assets/char/*.webp` → `apps-script/chars.html` (base64 인라인 CSS) | 안내 캐릭터 이미지를 바꾼 뒤 |
| `npm run serve` | `http://localhost:8790` 에 루트를 띄움 | 빌드 결과 눈으로 볼 때 |
| `npm run seed` | 영상 목록을 다시 만들어 `01_초기설정.gs` 에 주입 | 영상을 추가·교체할 때 |
| `npm run verify:yt` | 유튜브 ID 생존·임베드·재생시간 검증 | 새 영상 후보를 넣기 전 |
| `npm run verify:thumb` | maxresdefault 없는 영상을 찾아 `js.html` 의 `NO_MAXRES` 갱신 | 영상 목록을 바꾼 뒤 |
| `npm run check` | 테스트 + 빌드 한 번에 | 커밋 직전 |
| `npm run guide` | 운영 가이드북 HTML + A4 PDF 재생성 | 가이드북 글을 고친 뒤 |
| `npm run guide:shots` | 사이트를 캡처해 가이드북 그림을 다시 굽는다 | **화면이 바뀐 뒤** |
| `npm run guide:measure` | 콜아웃이 가리킬 요소 좌표 재측정 | 화면 배치가 바뀐 뒤 |
| `npm run guide:mask` | 1장 유튜브 캡처의 계정 정보를 가린다 | 업로드 화면을 새로 받은 뒤 |
| `npm run guide:sheet -- "시트주소"` | 구글 시트 화면을 찍는다 | 시트 구조가 바뀐 뒤 |
| `npm run guide:live -- "웹앱주소"` | 운영판에서만 나오는 화면을 찍는다 | 웹앱을 다시 배포한 뒤 |
| `npm run guide:export` | 가이드북을 docx · md 로 굽는다 | 배포본을 워드로 넘길 때 |

---

## 파일별 역할

| 파일 | 설명 |
|---|---|
| `mock.js` | `SpreadsheetApp` · `PropertiesService` · `Utilities` 등 Apps Script 런타임을 Node 에서 흉내 낸다. 테스트·빌드가 전부 이걸 깔고 돈다 |
| `test.js` | 통합 테스트 125건. `.gs` 3개를 한 스코프에서 평가해 실제 API 를 호출한다 |
| `build-static.js` | 백엔드를 돌려 실데이터를 뽑고, `apps-script/` 의 HTML·CSS·JS 와 `web/local-backend.js` 를 합쳐 단일 `index.html` 을 만든다. **12가지 무결성 검사를 통과해야 파일을 쓴다** |
| `make-xlsx.js` | 시드 데이터를 10개 탭 XLSX 로 출력. 탭 목록은 `HEADERS` 에서 자동으로 읽는다 |
| `gen-seed2.js` | 검증된 유튜브 목록(`data/*.json`)을 카테고리에 배치해 `data/seed-block.txt` 생성 |
| `patch-seed.js` | 그 블록을 `01_초기설정.gs` 의 `CAT_TREE`/`VIDEO_DATA` 자리에만 **외과적으로 교체**. 손으로 고친 계정·소유자·`TARGET_SHEET_ID` 가 날아가지 않도록 9가지 무결성 검사를 통과해야 저장한다 |
| `verify-yt.js` / `verify-more.js` | 후보 유튜브 ID 를 oEmbed(생존) + `playableInEmbed`(임베드 허용) + `lengthSeconds`(재생시간) 로 전수 검증 |
| `enrich-yt.js` | 검증 목록에 재생시간·임베드 여부를 채워 넣는다 |
| `chk-thumb.js` | 104편의 `maxresdefault` 존재 여부를 전수 확인해서 없는 것만 `js.html` 의 `NO_MAXRES` 에 구워 넣는다. 그래야 프론트가 처음부터 `hqdefault` 를 요청하고, 카드가 뜰 때마다 나던 404 가 사라진다 |
| `gen-chars.js` | `assets/char/*.webp` 를 CSS 클래스(`.ch-*` 전신 / `.chf-*` 얼굴)로 구워 `apps-script/chars.html` 을 만든다. 데모와 Apps Script 판이 같은 파일을 쓰므로 상대경로 대신 data URI 로 넣는다 |
| `prep-char.js` | 원본 캐릭터 PNG(배경이 흰색, 알파 없음)를 테두리 flood fill 로 따내고 트림·리사이즈해서 `assets/char/*.webp` 로 굽는다. **`sharp` 가 필요하다** (`npm i -D sharp`). 이미지를 새로 받았을 때만 한 번 돌린다 |
| `serve-root.js` | 로컬 정적 서버 (8790). MIME 타입과 **Range 요청**을 처리해서 히어로 영상이 GitHub Pages 와 똑같이 스트리밍된다 |
| `guide/` | 운영 가이드북(A4 38쪽) 제작 일습 — 캡처·좌표 측정·빌드·PDF. 자세한 건 [guide/README.md](guide/README.md) |
| `data/yt-final.json`, `data/yt-more.json` | 검증을 통과한 유튜브 영상 메타 (제목·재생시간). **여기 없는 ID 는 시드에 못 들어간다** |

---

## 대표 콘텐츠 영상 다시 만들기

`assets/hero/lesson.mp4` 는 원본을 ffmpeg 로 줄인 것입니다 (12.4MB → 5.0MB). 원본을 바꿨다면:

```bash
ffmpeg -i 원본.mp4 -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -vf scale=1280:-2 -c:a aac -b:a 64k -ac 1 -movflags +faststart assets/hero/lesson.mp4
```

`+faststart` 가 있어야 앞부분만 받아도 재생이 시작됩니다.

포스터는 대표 프레임 한 장을 960px WebP 로 뽑아 `assets/hero/poster.webp` 에 두고 `node tools/gen-chars.js` 를 돌립니다.

---

## ⚠ 반드시 지킬 것

**1. `index.html` 을 직접 고치지 마세요.**
생성물입니다. `apps-script/` 를 고치고 `npm run build` 를 돌리세요. 직접 고치면 다음 빌드에 사라집니다.

**2. 문자열 치환에 `String.replace(a, b)` 를 쓰지 마세요.**
치환 문자열 안의 `$$` 를 `$` 하나로 축약합니다. 실제로 `$$` 헬퍼 함수가 통째로 망가진 적이 있습니다.
반드시 함수형으로: `s.replace(a, () => b)`

**3. `01_초기설정.gs` 를 통째로 다시 쓰지 마세요.**
`write-setup-gs.js` 는 파일 전체를 덮어써서 손으로 고친 부분(계정·소유자·`TARGET_SHEET_ID`)을 날립니다.
영상만 바꿀 때는 `npm run seed` (= `gen-seed2` + `patch-seed`) 를 쓰세요.

**4. 스키마를 바꾸면 세 곳을 같이 고칩니다.**
`apps-script/00_설정.gs` 의 `HEADERS` → `02_API.gs` 의 읽기/쓰기 → `web/local-backend.js` 의 같은 함수.
한쪽만 고치면 정적판과 시트판이 어긋납니다. (실제로 `sched` 필드가 정적판에만 빠져 데모에서 계속 '미연결' 로 보인 적 있음)

**5. 시드 구조를 바꾸면 `build-static.js` 의 `ver` 를 올리세요.**
`sj-s6-` → `sj-s7-` 처럼. 방문자 브라우저의 localStorage 가 옛 구조를 계속 붙들고 있게 됩니다.
