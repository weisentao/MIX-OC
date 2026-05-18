# AI 鍔╂墜鎺ュ彛濂戠害

缁存姢浣嶇疆锛歚backend-source/docs/ai-assistant-api-contract.md`

鏍稿鏃堕棿锛?026-05-16銆傛湰鏂囦互褰撳墠宸插疄鐜版帴鍙ｄ负鍑嗭紝缁欏悗绔仈璋冨拰鍚庣画鎵╁睍浣跨敤銆傚墠绔粯璁?`baseURL=/api`锛屼笅鏂硅矾寰勪笉閲嶅鍐?`/api`锛涙湰鍦版帓鏌ユ椂鏍硅矾寰勪篃鍙闂€?
## 1. 鎬讳綋杈圭晫

AI 鍔╂墜鍙兘鐢卞悗绔唬鐞嗚皟鐢?DeepSeek銆傚墠绔笉寰楃洿杩?DeepSeek锛屼笉寰椾繚瀛樸€佷紶閫掓垨灞曠ず DeepSeek key锛屼篃涓嶅緱鎶?key 鍐欏叆鍓嶇 `.env`銆佹瀯寤轰骇鐗┿€佹湰鍦板瓨鍌ㄣ€佽姹傚ご銆佽姹備綋銆佹棩蹇楁垨鍝嶅簲銆?
DeepSeek key 鍙兘淇濆瓨鍦ㄥ悗绔?AI JSON 閰嶇疆鎴栧悗绔繍琛岀幆澧冨彉閲忎腑銆傚悗鍙扮鐞嗕粎鍏佽鎻愪氦 homeDeepSeekApiKey 鍜?hrDeepSeekApiKey 涓や釜 scoped key 瀛楁锛涘搷搴斿彧鑳借繑鍥?configured 涓?masked 鐘舵€侊紝涓嶈兘鍥炴樉鏄庢枃 key銆傝繍琛屾椂浼樺厛浣跨敤宸蹭繚瀛?scoped key锛屽叾娆′娇鐢?DEEPSEEK_HOME_API_KEY / DEEPSEEK_HR_API_KEY锛屾渶鍚庡洖閫€ DEEPSEEK_API_KEY銆傜姝㈠啓鍏ュ墠绔?.env銆佹瀯寤轰骇鐗┿€佹湰鍦板瓨鍌ㄣ€佽姹傚ご銆佹棩蹇楁垨浠讳綍鎺ュ彛鍝嶅簲銆?
褰撳墠榛樿妯″瀷鏄?`deepseek-v4-flash`锛屽彲閫夋ā鍨嬫槸 `deepseek-v4-pro`銆傛棫妯″瀷鍚?`deepseek-chat` 鍜?`deepseek-reasoner` 浠呬綔涓哄吋瀹瑰埆鍚嶏紝鍚庣浼氬垎鍒綊涓€鍖栧埌 flash/pro銆?
## 2. 鏉冮檺

鎵€鏈?AI 鎺ュ彛閮藉繀椤荤櫥褰曘€?
`/workspace/ai/**` 闈㈠悜鏅€氬伐浣滃彴鐢ㄦ埛锛屽悗绔繀椤绘寜褰撳墠鐢ㄦ埛鏉冮檺瑁佸壀椤圭洰銆佷换鍔°€佹帓鏈熴€佽瘎璁恒€佹枃妗ｇ瓑涓婁笅鏂囥€?
`/admin/ai/**` 浠呭厑璁?admin/super_admin銆俛dmin 鍙互淇敼闈炲瘑閽ラ厤缃€佺鐞嗚祫鏂欐枃妗ｃ€佹煡鐪嬪叏灞€鏃ュ織锛屼絾涓嶈兘璇诲啓 DeepSeek key銆?
`/manager/ai/**` 闈㈠悜鏅€氱鐞嗙锛屽彧璇诲綋鍓嶆潈闄愯寖鍥村唴鐨勯厤缃憳瑕佸拰鏃ュ織銆傛櫘閫氱鐞嗕笉鑳戒慨鏀规ā鍨嬨€佽仈缃戝紑鍏炽€佽祫鏂欐枃妗ｆ垨鍏ㄥ眬閰嶇疆銆?
鏉冮檺褰掍竴鍖栧彛寰勶細`admin` 鍜?`super_admin` 閮芥寜瓒呯骇鍚庡彴鏉冮檺澶勭悊锛屽彲浠ヨ闂?`/admin/ai/**`锛沗project_manager`銆乣department_manager`銆乣department_admin` 閮芥寜鏅€氱鐞嗘潈闄愬鐞嗭紝鍙兘璁块棶 `/manager/ai/**` 鐨勫彧璇荤粨鏋溿€傚悗绔湪璇诲彇鏃ュ織銆佽祫鏂欏彫鍥炲拰鑱婂ぉ涓婁笅鏂囨椂蹇呴』鍩轰簬褰掍竴鍖栧悗鐨勮鑹查噸鏂拌绠楄祫婧愯寖鍥达紝涓嶈兘鍙俊鍓嶇浼犲叆鐨勮鑹插悕鎴栨寜閽姸鎬併€?
## 3. 鐜鍙橀噺

| 鍙橀噺 | 榛樿鍊?| 璇存槑 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 绌?| DeepSeek 鍏煎鍥為€€ key锛屼粎鍚庣浣跨敤銆?|
| `DEEPSEEK_HOME_API_KEY` | 绌?| 宸ヤ綔鍙伴椤?鑱婂ぉ浼樺厛 key锛屼粎鍚庣浣跨敤銆?|
| `DEEPSEEK_HR_API_KEY` | 绌?| 浜哄姏鍒嗛厤寤鸿浼樺厛 key锛屼粎鍚庣浣跨敤銆?|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI-compatible chat completions 鍦板潃鍓嶇紑銆?|
| `DEEPSEEK_DEFAULT_MODEL` | `deepseek-v4-flash` | 榛樿妯″瀷銆?|
| `DEEPSEEK_FALLBACK_MODEL` | `deepseek-v4-pro` | 鍙€夊鐢ㄦā鍨嬨€?|
| `DEEPSEEK_TIMEOUT_MS` | `20000` | 鍗曟璋冪敤瓒呮椂銆?|
| `AI_DATA_DIR` | `backend-source/data/ai-v1` | 褰撳墠 JSON 閰嶇疆銆佹枃妗ｅ拰鏃ュ織鐩綍銆?|

鍚庣鍚姩鍜岃姹傛棩蹇椾笉寰楄緭鍑?key銆傚彧鍏佽杈撳嚭 `configured=true/false` 杩欑鑴辨晱鐘舵€併€?
## 4. 褰撳墠鎺ュ彛娓呭崟

### 宸ヤ綔鍙?
| Method | Path | 璇存槑 |
| --- | --- | --- |
| POST | `/workspace/ai/chat` | 鍙戣捣 AI 闂瓟銆?|
| POST | `/workspace/ai/home-assistant` | 棣栭〉鍔╂墜鏃у叆鍙ｅ吋瀹癸紝澶嶇敤 `/workspace/ai/chat`銆?|
| GET | `/workspace/ai/chat` | Returns backend proxy availability only; does not call DeepSeek. |
| GET | `/workspace/ai/home-assistant` | Returns Home AI backend availability only; does not call DeepSeek. |
| GET | `/workspace/ai/settings` | 鑾峰彇褰撳墠鐢ㄦ埛鍙 AI 璁剧疆鎽樿銆?|
| GET | `/workspace/ai/logs` | 鑾峰彇褰撳墠鐢ㄦ埛鑷繁鐨?AI 浣跨敤璁板綍銆?|

### 鏅€氱鐞?
| Method | Path | 璇存槑 |
| --- | --- | --- |
| GET | `/manager/ai/config` | 鑾峰彇鍙閰嶇疆鎽樿銆?|
| GET | `/manager/ai/logs` | 鑾峰彇褰撳墠鐢ㄦ埛鍙鏃ュ織銆?|

### 瓒呯骇鍚庡彴

| Method | Path | 璇存槑 |
| --- | --- | --- |
| GET | `/admin/ai/config` | 鑾峰彇鍏ㄥ眬 AI 閰嶇疆銆?|
| PATCH | `/admin/ai/config` | 鏇存柊闈炲瘑閽ラ厤缃€?|
| GET | `/admin/ai/models` | 鑾峰彇妯″瀷閫夐」銆?|
| GET | `/admin/ai/usage-logs` | 鑾峰彇鍏ㄥ眬浣跨敤鏃ュ織銆?|
| GET | `/admin/ai/documents` | 鑾峰彇璧勬枡鏂囨。銆?|
| POST | `/admin/ai/documents` | 鏂板璧勬枡鏂囨。銆?|
| PATCH | `/admin/ai/documents/:documentId` | 鏇存柊璧勬枡鏂囨。銆?|
| DELETE | `/admin/ai/documents/:documentId` | 鍒犻櫎璧勬枡鏂囨。銆?|
| DELETE | `/admin/ai/documents/:documentId` | Deletes the document and records redacted `reason`/`deleteReason` metadata when supplied. |

鍏煎锛歚PATCH/DELETE /admin/ai/documents` 涔熷彲閫氳繃 body/query 閲岀殑 `id` 瀹氫綅鏂囨。銆?Delete compatibility: `DELETE /admin/ai/documents/:documentId` and `DELETE /admin/ai/documents` both accept `reason`, `deleteReason`, `deletionReason`, `auditReason`, or `note`; the backend redacts secret-looking values, stores a bounded deletion metadata record in the JSON document store, and returns `deleteReasonRecorded`.

## 5. POST /workspace/ai/chat

璇锋眰浣撶ず渚嬶細

```json
{
  "message": "甯垜鎬荤粨浠婂ぉ鏈€闇€瑕佸鐞嗙殑浠诲姟",
  "conversationId": "conv-001",
  "scope": "project",
  "scopeTargetId": "project-001",
  "scopeTargetName": "MIX Web 閲嶆瀯",
  "model": "deepseek-v4-flash",
  "webSearchEnabled": false,
  "messages": [
    { "role": "user", "content": "涔熷吋瀹?OpenAI 椋庢牸娑堟伅" }
  ],
  "context": {
    "projectId": "project-001",
    "taskId": "task-001"
  }
}
```

褰撳墠瀹炵幇浼樺厛璇诲彇 `message/question/query`锛屼篃鍏煎 `messages` 閲屾渶鍚庝竴鏉?user 娑堟伅銆俙context` 鍜屽悇绉嶈祫婧?id 鍙唬琛ㄥ墠绔剰鍥撅紝鍚庣蹇呴』閲嶆柊鎸?token 鏍￠獙鏉冮檺銆?
鑱婂ぉ璇锋眰鏀寔 `scopeTargetId` 鍜?`scopeTargetName`锛岀敤浜庢妸 `department/project/self` 杩欑被鑼冨洿缁戝畾鍒板叿浣撳璞°€傚悗绔彲浠ユ帴鏀跺墠绔紶鍏ョ殑瀵硅薄鍚嶇敤浜庢樉绀哄厹搴曪紝浣嗗啓鍏ユ棩蹇楀拰杩斿洖鍝嶅簲鏃跺簲浠ユ潈闄愭牎楠屽悗鐨勭湡瀹炲璞′负鍑嗭紱濡傛灉 `scope` 鏄?`global/workspace/home` 杩欑被娉涜寖鍥达紝`scopeTargetId` 鍜?`scopeTargetName` 杩斿洖绌哄瓧绗︿覆鎴?`null`锛屽墠鍚庣闇€淇濇寔鍚屼竴绉嶇┖鍊肩瓥鐣ャ€?
鑱旂綉璇锋眰瀛楁浠ュ悗绔爣鍑嗗瓧娈?`webSearchEnabled` 涓哄噯銆傛棫鍓嶇鍙兘浠嶆彁浜?`webSearch`銆乣allowWebSearch` 鎴?`enableWebSearch`锛屽悗绔彲浣滀负鍏煎鍒悕璇诲彇锛屼絾閰嶇疆淇濆瓨銆佽亰澶╁搷搴斿拰鏃ュ織璁板綍閮界粺涓€浣跨敤 `webSearchEnabled` / `webSearchUsed`銆?
鍝嶅簲绀轰緥锛?
```json
{
  "answer": "浣犲ソ鍚屽锛?+1=2銆?,
  "sources": [
    { "type": "deepseek", "name": "DeepSeek" }
  ],
  "usage": {
    "promptTokens": 12,
    "completionTokens": 8,
    "totalTokens": 20
  },
  "conversationId": "conv-001",
  "messageId": "msg_xxx",
  "model": "deepseek-v4-flash",
  "scope": "project",
  "scopeTargetId": "project-001",
  "scopeTargetName": "MIX Web 閲嶆瀯",
  "webSearchUsed": false,
  "source": "deepseek",
  "createdAt": "2026-05-15T10:20:30.000Z"
}
```

If Home AI is not configured, `POST /workspace/ai/chat` and `POST /workspace/ai/home-assistant` return an explicit backend `503` with `AI_KEY_NOT_CONFIGURED`; upstream failures return explicit backend availability errors with redacted reasons. `GET /workspace/ai/chat` and `GET /workspace/ai/home-assistant` are safe readiness probes: they return status/configured booleans only and never call DeepSeek.

## 6. 璁剧疆鎺ュ彛鍝嶅簲

`GET /workspace/ai/settings`銆乣GET /manager/ai/config`銆乣GET /admin/ai/config` 鐨勬牳蹇冨瓧娈靛涓嬶細

```json
{
  "enabled": true,
  "provider": "deepseek",
  "configured": false,
  "apiKeyConfigured": false,
  "keySource": "env",
  "defaultModel": "deepseek-v4-flash",
  "modelId": "deepseek-v4-flash",
  "fallbackModel": "deepseek-v4-pro",
  "webSearchEnabled": false,
  "allowWebSearch": false,
  "knowledgeScopes": ["tasks", "comments", "schedule", "documents"],
  "maxContextMessages": 8,
  "maxMessageChars": 2000,
  "maxContext": 2000,
  "temperature": 0.3,
  "openingTemplate": "浣犳槸 MIX 鍗忎綔鍙伴椤电殑 AI 鍔╂墜銆?,
  "availableModels": []
}
```

`configured/apiKeyConfigured` 鍙〃绀哄悗绔槸鍚﹁兘璇诲彇 key锛屼笉寰楄繑鍥?key 鍐呭銆俙keySource` 褰撳墠鍥哄畾涓?`env`銆?
鑱旂綉閰嶇疆瀛楁浠ュ悗绔?`webSearchEnabled` 涓烘爣鍑嗐€俙allowWebSearch` 鍙綔涓烘棫鍓嶇鍙鍏煎瀛楁瀛樺湪锛屽墠绔繚瀛樻椂搴旀彁浜?`webSearchEnabled`锛屽悗绔搷搴斾腑鍗充娇鍚屾椂杩斿洖鏃у埆鍚嶏紝涔熷繀椤讳繚璇佹棫鍒悕涓?`webSearchEnabled` 鍊间竴鑷淬€?
## 7. PATCH /admin/ai/config

鍏佽鏇存柊锛?
```json
{
  "enabled": true,
  "modelId": "deepseek-v4-flash",
  "fallbackModel": "deepseek-v4-pro",
  "webSearchEnabled": false,
  "knowledgeScopes": ["tasks", "comments", "schedule", "documents"],
  "maxContextMessages": 8,
  "maxMessageChars": 2000,
  "temperature": 0.3,
  "openingTemplate": "浣犲ソ鍚屽锛屼笅闈㈡槸鎴戞暣鐞嗙殑绛旀锛?
}
```

濡傛灉璇锋眰浣撳寘鍚?`apiKey`銆乣deepseekApiKey`銆乣DEEPSEEK_API_KEY`銆乣DEEPSEEK_HOME_API_KEY`銆乣DEEPSEEK_HR_API_KEY`銆乣authorization`銆乣token`銆乣secret` 绛夊瓧娈碉紝鍚庣蹇呴』杩斿洖 `400`锛岄伩鍏嶅舰鎴愬悗鍙板啓瀵嗛挜鐨勯敊璇矾寰勩€?
## 8. 璧勬枡鏂囨。

褰撳墠鏂囨。瀛樺偍涓?JSON锛屾湭鏉ュ彲杩佺Щ鍒版暟鎹簱鍜屽悜閲忕储寮曘€傚瓧娈靛缓璁繚鎸侊細

```json
{
  "id": "doc_xxx",
  "title": "浜や粯瑙勮寖",
  "content": "鏂囨。姝ｆ枃",
  "summary": "鎽樿",
  "scope": "global",
  "scopeTargetId": "",
  "scopeTargetName": "",
  "status": "active",
  "tags": ["瑙勮寖"],
  "createdBy": "u-001",
  "createdAt": "2026-05-15T10:20:30.000Z",
  "updatedAt": "2026-05-15T10:20:30.000Z"
}
```

`scope` 瑙勮寖鍊煎缓璁娇鐢?`global/workspace/home/self/department/project`銆傚綋 `scope` 涓?`department/project/self` 鏃讹紝鍓嶇浼氬悓鏃舵彁浜?`scopeTargetId` 鍜?`scopeTargetName`锛屽悗绔繀椤讳繚瀛樺苟鍦ㄥ彫鍥炴椂鐢ㄧ湡瀹炴潈闄愰噸鏂版牎楠岋紝涓嶈兘鍙俊鍓嶇浼犲叆鐨勫璞″悕銆?
璧勬枡鏂囨。鐨勬柊澧炪€佺紪杈戙€佸垪琛ㄥ拰璇︽儏鍝嶅簲閮藉繀椤绘敮鎸佸苟杩斿洖 `scopeTargetId`銆乣scopeTargetName`銆傚悗鍙板垪琛ㄧ瓫閫夊埌鍏蜂綋閮ㄩ棬銆侀」鐩垨鏈汉鑼冨洿鏃讹紝鍓嶇渚濊禆杩欎袱涓瓧娈靛洖鏄鹃€夋嫨鍣紱鍚庣濡傛灉鍙戠幇鐩爣瀵硅薄琚垹闄ゆ垨褰撳墠鐢ㄦ埛鏃犳潈璁块棶锛屽簲杩斿洖鑴辨晱鍚庣殑绌哄悕绉版垨鐩存帴杩囨护璇ユ枃妗ｏ紝涓嶈兘娉勬紡鏈巿鏉冨璞″悕銆?
鍚庣画鎺ュ叆鏂囨。搴撴垨鍚戦噺搴撴椂锛屽彫鍥炵粨鏋滀粛蹇呴』鍏堟寜鐢ㄦ埛 scope 杩囨护锛屽啀杩涘叆 DeepSeek 鎻愮ず璇嶃€?
Document deletion is hard removal from active documents in the current JSON store, with a bounded `deletedDocuments` metadata list for operator context. This metadata is not a substitute for a full admin audit log.

## 11. 2026-05-17 AI key admin update

`PATCH /admin/ai/config` supports saving only scoped DeepSeek key fields. The backend persists them in the existing AI JSON config store and synchronizes the running process immediately so new chat/advice requests use the latest value without restart. Do not paste real keys into docs, source, logs, frontend `.env`, localStorage, request examples, or screenshots.

Accepted scoped input fields:

- Canonical: `homeDeepSeekApiKey`, `hrDeepSeekApiKey`.
- Frontend aliases: `homeApiKey`, `hrApiKey`.
- Compatibility aliases: `home_deepseek_api_key`, `hr_deepseek_api_key`, `deepseekHomeApiKey`, `deepseekHrApiKey`, `homeDeepSeekKey`, `hrDeepSeekKey` (environment-shaped names such as `deepseek_home_api_key` remain rejected).

Safe local JSON/config evidence may show only masked/status fields, for example `homeApiKeyConfigured: true`, `hrApiKeyConfigured: true`, `homeMasked`, `hrMasked`, and `keyStatus`. Never record plaintext key values.

Response bodies must never include plaintext key values. `GET /admin/ai/config`, `PATCH /admin/ai/config`, and `GET /workspace/ai/settings` may return only boolean and masked status such as `homeConfigured`, `hrConfigured`, `homeMasked`, `hrMasked`, and `keyStatus`. Generic secret fields such as `apiKey`, `deepseekApiKey`, `authorization`, `token`, and `secret` remain rejected with `400`.

Runtime key resolution is scoped:

1. Admin-saved scoped JSON keys are hydrated/synchronized into `DEEPSEEK_HOME_API_KEY` / `DEEPSEEK_HR_API_KEY`.
2. Runtime scoped environment variables are used before legacy fallback.
3. Legacy fallback remains `DEEPSEEK_API_KEY`.

Readiness endpoints:

- `GET /workspace/ai/chat` and `GET /workspace/ai/home-assistant` return Home AI proxy readiness without contacting DeepSeek.
- `GET /workspace/resources/ai/assignment-advice` returns HR AI proxy readiness without contacting DeepSeek.
## 9. 浣跨敤鏃ュ織

鏃ュ織鍒嗛〉鍜岀瓫閫夎姹傜粺涓€鍏煎浠ヤ笅 query 鍙傛暟锛岄€傜敤浜?`GET /workspace/ai/logs`銆乣GET /manager/ai/logs` 鍜?`GET /admin/ai/usage-logs`锛?
| Query | 璇存槑 |
| --- | --- |
| `page` | 椤电爜锛屼粠 1 寮€濮嬶紝缂虹渷涓?1銆?|
| `pageSize` | 姣忛〉鏁伴噺锛岀己鐪佸缓璁负 20銆?|
| `limit` | `pageSize` 鐨勫吋瀹瑰埆鍚嶏紱鍚屾椂鍑虹幇鏃朵互鍚庣绾﹀畾鐨勪紭鍏堢骇涓哄噯锛屽缓璁紭鍏堜娇鐢?`pageSize`銆?|
| `keyword`銆乣q` | 鎼滅储鍏抽敭瀛楋紝寤鸿鍖归厤闂鎽樿銆佸洖绛旀憳瑕併€佺敤鎴峰悕鍜岃祫鏂欐爣棰樼瓑鑴辨晱瀛楁銆?|
| `status` | 鏃ュ織鐘舵€佺瓫閫夛紝甯歌鍊间负 `success/fallback/failed/error`銆?|
| `scope` | 鑼冨洿绛涢€夛紝甯歌鍊间负 `global/workspace/home/self/department/project`锛涘悗绔繀椤诲彔鍔犲綋鍓嶇敤鎴锋潈闄愯繃婊ゃ€?|

鏃ュ織鍒楄〃缁熶竴杩斿洖锛?
```json
{
  "rows": [],
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

鍗曟潯鏃ュ織鑷冲皯鍖呭惈 `id`銆乣userId`銆乣username`銆乣role`銆乣question`銆乣answerPreview`銆乣model`銆乣webSearchUsed`銆乣scope`銆乣status`銆乣source`銆乣latencyMs`銆乣createdAt`銆傚缓璁悓鏃惰繑鍥烇細

```json
{
  "scopeTargetId": "project-001",
  "scopeTargetName": "MIX Web 閲嶆瀯",
  "usage": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0
  },
  "retrieval": {
    "requestedScope": "home",
    "documentCount": 0,
    "documentIds": []
  },
  "failureReason": ""
}
```

浣跨敤鏃ュ織蹇呴』璁板綍骞惰繑鍥炶亰澶╂椂褰掍竴鍖栧悗鐨?`scopeTargetId` 鍜?`scopeTargetName`锛岃繖鏍峰伐浣滃彴涓汉鏃ュ織銆佹櫘閫氱鐞嗘棩蹇楀拰瓒呯骇鍚庡彴鍏ㄥ眬鏃ュ織鍙互鐢ㄥ悓涓€濂楀瓧娈靛洖鏄捐寖鍥淬€俙webSearchUsed` 琛ㄧず鏈鍥炵瓟鏄惁瀹為檯浣跨敤鑱旂綉鑳藉姏锛涗笉鑳界敤鏃у埆鍚嶆浛浠ｏ紝鏃у墠绔睍绀哄眰鍙互鑷鍏煎鍘嗗彶瀛楁銆?
鏃ュ織涓嶅緱淇濆瓨 DeepSeek key銆丣WT銆丄uthorization header銆佸瘑鐮佹垨瀹屾暣鏁忔劅姝ｆ枃銆傛櫘閫氱鐞嗘棩蹇楀彧鑳借繑鍥炴湰浜烘棩蹇楋紝鎴栨槑纭巿鏉冪殑椤圭洰/閮ㄩ棬 scope 鏃ュ織锛沗workspace/global/home/self` 杩欑被娉?scope 涓嶈兘鐢ㄦ潵鏆撮湶鍏朵粬浜虹殑鏃ュ織銆?
## 10. 鑱旇皟 Checklist

Current acceptance note: Home AI without a configured scoped/legacy key returns an explicit backend key-not-configured response; readiness probes return status and configured booleans. HR assignment advice without a configured scoped/legacy key returns HR_AI_KEY_NOT_CONFIGURED.

1. 鏈甫 token 璇锋眰 `/api/workspace/ai/chat` 杩斿洖 401銆?2. 鍓嶇婧愮爜銆佽姹傘€佸搷搴斿拰鏋勫缓浜х墿涓笉鑳藉嚭鐜?DeepSeek key銆?3. 榛樿鑱婂ぉ涓嶄紶妯″瀷鏃讹紝鍝嶅簲妯″瀷涓?`deepseek-v4-flash`銆?4. 棣栭〉鍦烘櫙鏈厤缃?`DEEPSEEK_HOME_API_KEY` 涓?`DEEPSEEK_API_KEY` 鏃讹紝鑱婂ぉ鎺ュ彛杩斿洖鏄庣‘鐨?key 鏈厤缃敊璇垨 `AI_KEY_NOT_CONFIGURED` 鐨勫厹搴曠瓟妗堬紙鎸夊綋鍓嶅疄鐜板垎鏀級锛屼笖涓嶆硠闇插瘑閽ャ€?5. 浜哄姏鍦烘櫙鏈厤缃?`DEEPSEEK_HR_API_KEY` 涓?`DEEPSEEK_API_KEY` 鏃讹紝`/workspace/resources/ai/assignment-advice` 杩斿洖 503 涓?`HR_AI_KEY_NOT_CONFIGURED`銆?6. manager token 璇锋眰 `/api/admin/ai/config` 杩斿洖 403銆?7. manager 鍙兘璁块棶 `/api/manager/ai/config` 鍜?`/api/manager/ai/logs` 鐨勫彧璇荤粨鏋溿€?8. admin 閰嶇疆鎺ュ彛鎷掔粷浠讳綍瀵嗛挜瀛楁銆?9. Document CRUD works for create, edit, enable/disable, and delete; delete responses include `deleteReasonRecorded` when a redacted reason is stored.
9. 浣跨敤鏃ュ織鑳藉湪宸ヤ綔鍙颁釜浜烘棩蹇椼€佹櫘閫氱鐞嗘棩蹇椼€佽秴绾у悗鍙板叏灞€鏃ュ織涓寜鏉冮檺鏌ョ湅銆?10. 鏈潵妫€绱㈠瓧娈典笂绾垮墠锛屽繀椤昏ˉ鍏?scope 杩囨护鍜岃劚鏁忔祴璇曘€?




