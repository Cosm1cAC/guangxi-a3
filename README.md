# 山水尖3 · 广西 A3

Node + TypeScript + Three.js + PostgreSQL，Web 与微信原生小程序共用规则引擎、账号和房间服务。Web 端是方块像素风的 3D 牌桌：体素喀斯特峰林、木平台茶亭、方块灯笼、像素扑克和可换装的方块人；场景、牌面与纹理由代码生成，无需远程图片服务；背景音乐预置 4 首经作者声明以 CC0 发布的钢琴／氛围作品，来源与授权见 `public/audio/CREDITS.txt`。

源码：[Cosm1cAC/guangxi-a3](https://github.com/Cosm1cAC/guangxi-a3) · [在线开桌](https://a3.vibelink.cloud/go/) · [安卓下载页](https://a3.vibelink.cloud/download/) · [GitHub Releases](https://github.com/Cosm1cAC/guangxi-a3/releases)

安卓安装包由 GitHub Releases 分发，下载页与游戏仍通过本机穿透提供。发布附件 `shanshui-a3.apk` 为正式签名包，附带 `shanshui-a3.apk.sha256`；安装包不提交到 Git 源码历史。当前版本与下载页校验信息见 `public/download/release.json`。

`.env`、`.local/`、数据库、穿透认证文件、安卓发布签名密钥及构建产物均被忽略。克隆仓库后按 `.env.example` 配置；不要把实际 Token 或发布签名密钥提交到公开仓库。

## 本地启动

Windows 可直接双击根目录的 **`一键启动.cmd`**。脚本会检查 Node 和依赖、创建缺失的 `.env`、连接或启动 PostgreSQL、执行迁移，等待 Web / API 就绪后打开浏览器。首次运行需要联网下载依赖及原生 PostgreSQL 程序，全程不使用 Docker。

保持启动窗口开启，按 **Ctrl+C** 停止本次启动的游戏服务和原生数据库进程；数据库文件与对局数据保留。重复启动会打开已运行的游戏；端口被其他程序占用时会提示，不会强制结束其他程序。已有 `.env` 不会覆盖，远程数据库连接失败时也不会擅自替换为本地数据库。

需要 Node 22.12+。默认由脚本在 Windows 上启动原生 PostgreSQL 18，数据库文件放在 `.local/postgres/`。也可在 `.env` 中配置已有的本机或远程 PostgreSQL。不会安装系统服务或修改已有数据库。

为兼容项目中文路径，脚本会在 `%LOCALAPPDATA%/A3-native/` 创建指向项目的目录联接，实际数据仍在项目 `.local/` 内。自动准备数据库支持 Windows x64。建议用 Ctrl+C 正常退出；已有外部数据库不会随游戏退出而停止。

```powershell
npm install
Copy-Item .env.example .env
node scripts/start.mjs
```

打开 http://localhost:5173 。API 为 http://localhost:3001 。只体验机器人练习可直接 `npm run dev:web`，不需要数据库。

好友局：登录账号后创建房间，把 10 位房号发给好友；好友在浏览器或小程序登录后加入，四人到齐自动开始。座位按账号认领，刷新、换浏览器或换设备登录同一账号都能回到原座位。同一浏览器的多个标签页共用一个账号；本机想凑四人测试，请用不同浏览器或无痕窗口分别登录四个账号。离线练习为本地状态，不需要账号；联机由服务端裁判。

## 账号、形象与多端互通

- **账号注册 / 登录**：注册时填写独立账号名、邮箱、密码和牌桌昵称，之后可用账号名或邮箱登录同一个账号。账号名为 3–24 位字母、数字或下划线，不区分大小写且设置后不可修改；昵称可在资料页修改。旧账号继续使用邮箱登录，可在资料页补设账号名；旧版安卓注册请求保留兼容性。密码用 scrypt 加盐存储，会话令牌只存哈希，30 天有效。
- **邮箱验证可选**：未验证也能注册、登录和游戏。配置 SMTP 后，可在注册时填写验证码或在资料页补验证，页面单独显示验证状态；不配置 SMTP 时不显示验证码操作。验证码经过验证才会标记邮箱为已验证。
- **扫码登录入口已下架**：登录窗口只保留账号名／邮箱登录与邮箱注册，旧扫码确认页不再触发。后台授权代码保留供以后取得合格网站应用后使用，当前未启用正式微信扫码。
- **在线人数**：网页和安卓游戏界面显示“在线人数 / 服务器配置容量”，例如 `5/20`。前台每 20 秒发送心跳，60 秒内活跃的游客按浏览器去重，登录玩家按账号去重；同账号多设备算一人。`A3_SERVER_CAPACITY` 默认 20，是部署配置参考值，不是硬件压测结论或强制准入限流。后台页面或离线设备停止心跳后自动从在线人数中移除。
- **人物形象**：大厅「我的形象」可调肤色、发型、发色、瞳色、上衣、裤子、帽子（斗笠、壮锦头巾、草帽…）和配饰，3D 实时预览、可拖动旋转。游客形象存在本机，注册时带入账号；登录后保存到账号，入座时牌友看到的就是这个方块人，名牌和聊天里是对应的像素头像。
- **多端互通**：服务端跑在本机并监听局域网。启动窗口和资料页会给出形如 `http://192.168.x.x:5173` 的地址与二维码，手机、平板连同一 Wi‑Fi 打开即可；任何设备登录同一账号，形象、积分以及进行中的牌局都在（大厅出现「回到牌桌」）。首次使用若其他设备打不开，请在 Windows 防火墙弹窗中允许 Node.js 访问专用网络。
- **战绩与积分榜**：四位真人的好友局结算后累计到账号，资料页可看积分榜。
- **人数不足可补机器人**：好友房等待时，房主点击「补齐机器人并开始」，保留已入座真人，只补空位至四人并立即开局；机器人座位有明确标识。房主离席后，由等待房内首位玩家接任。机器人会继续参与出牌、局间换牌和下一局；混合房积分只在房内累计，不计入账号战绩与排行榜。网页、安卓、微信及抖音端使用同一房间接口。
- **开局后真人可接替机器人**：新玩家按房号加入，直接接替仍有手牌的机器人；若机器人均已出完，则接替已出完的座位等下一局。沿用座位当前手牌、身份、本房累计分、进贡预选／猜拳和回牌状态，不重发牌；同账号重连仍回原位，四真人满房拒绝额外加入。接替当局不计账号排行，下一局若四位均为真人则正常记录账号战绩；局间结算时也可接替机器人。

微信正式扫码使用微信开放平台审核通过的**网站应用**及其微信登录权限（`snsapi_login`），不能填小程序、公众号或开放平台账号本身的 AppID。服务器 `.env` 填 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_REDIRECT_BASE=https://a3.vibelink.cloud`；平台「授权回调域」填写 `a3.vibelink.cloud`，实际回调地址为 `https://a3.vibelink.cloud/api/auth/wechat/callback`。固定入口已代理 `/api/`，不需要随免费 cpolar 地址变化而修改回调域。域名与应用材料仍需符合平台审核要求。

凭据只保存在已忽略的本机 `.env`，不要写入网页、小程序或 GitHub。修改后重新启动服务；公网启动默认关闭模拟授权。后续恢复扫码入口时，需检查 `/api/auth/config` 的 `wechat` 为 `real`，再由本人微信扫码确认，验证游戏账号登录、重复登录复用原账号和跨设备战绩一致。自动化测试中的微信接口替身只能验证程序流程，不能代替真实微信授权。官方接入说明：[网站应用微信登录开发指南](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)。

```powershell
npm test
npx tsx scripts/accounts-smoke.ts # 使用隔离 PostgreSQL schema 与本机 SMTP 收件器验证账号和浏览器流程
npx tsx scripts/room-bots-smoke.ts --browser # 临时 schema 验证补位、并发、换牌和手机界面，结束自动清理
npm run build
npm run test:e2e
npx tsx scripts/api-smoke.ts   # 可用 A3_API_BASE 指定 API；两局全流程请求较多，测试服务可设 A3_RATE_LIMIT=5000
```

浏览器测试默认使用本机 Windows Chrome；其他机器修改 `playwright.config.ts` 的 executablePath 或使用 Playwright 自带 Chromium。API smoke 需数据库迁移完成且 API 在运行。

## 微信小程序

`miniprogram/` 是 WXML/WXSS 小程序调试工程，尚未适配 `game.js` / `game.json` 和 Canvas 界面的微信小游戏运行环境，不能直接作为小游戏包上传。山水尖3的对战玩法需要游戏类目账号；普通工具小程序账号不能通过修改名称变成小游戏账号。

2026-11-14 已核对微信官方[小游戏类目设置](https://developers.weixin.qq.com/minigame/introduction/guide/type.html)：注册时需勾选“游戏”，一级类目不可更换，个人主体暂不支持“牌类”。申请正式牌类账号前应先确认可用主体及后台要求。以下是现有小程序工程的开发调试步骤，不代表已具备微信发布条件。

1. `npm run build` 生成小程序 JavaScript bundle，无需在开发者工具中重复构建 npm。
2. 微信开发者工具导入 `miniprogram/`。将 `project.config.json` 的 touristappid 替换为你的 AppID。
3. 本地模拟器调试可在开发者工具关闭合法域名校验。真机调试把 `miniprogram/config.ts` 改成电脑的局域网地址（如 `http://192.168.1.10:3001/api`）并勾选「不校验合法域名」；正式发布需改为 HTTPS API 并在微信后台添加 request 合法域名，再构建。
4. 真机可独立玩机器人练习；好友房在「好友开桌」里用邮箱登录 / 注册后开房或加入，与 Web 端同一账号、同一房间互通。服务端配置 `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET` 后可用「微信一键登录」。小程序没有使用 web-view，界面名为「方块A3」，采用矩形绿毡牌桌、深色方块房间、直角按钮、内嵌像素字体与账号像素头像；手牌按七列完整排布，保留身份牌提醒。

小程序场景位于 `src/visual/table.ts`，Web 场景位于 `src/web/scene/`。Web 使用 Three.js r180，小程序使用微信官方 scoped 适配包（内核 r108），避免把浏览器 DOM 假设带入小程序。适配包来源：https://github.com/wechat-miniprogram/threejs-miniprogram 。像素字体为 Fusion Pixel Font 的更名子集，许可位于 `miniprogram/fonts/`，未收录的昵称字形使用系统后备字体。需在目标手机验证字体、性能和生命周期。

小程序的展示术语通过 `miniprogram/presentation.ts` 转换：进贡／还贡显示为交牌／回牌，独食显示为单人阵营，农民方显示为普通阵营。规则说明完整保留输赢积分、逐张等量回牌、可退原牌及禁止回 ♠A、♠3、♦4 等条件；共享引擎与接口字段保持一致。抖音使用下面的独立 Canvas 工程，微信 WXML 包不能直接作为抖音小游戏上传。

## 抖音小游戏：像素A3

`douyin/` 是原生小游戏工程，入口由 `src/douyin/main.ts` 构建为 `game.js`，配套 `game.json` 和真实 AppID `ttbf93c92e21efdb9f02`。界面完全使用 Canvas 2D 绘制像素牌桌、头像、完整手牌、分页规则、登录／好友房及隐私说明，使用 `tt` 触控、键盘、缓存、请求和前后台接口，不加载网页。规则和中性术语与其他客户端共用。侧边栏入口按 `tt.checkScene` 的支持结果显示，通过 `tt.navigateToScene` 跳转。

- `npm run build:douyin`：检查类型并生成调试包；`npm run build` 也包含这一步。
- `npm run build:douyin:release`：额外检查真实 AppID 后生成上传工程；该命令只构建，不代表已通过平台审核。
- 抖音开发者工具导入 `douyin/`。像素字体 TTF 与许可证随包提供，不需要远程字体服务。需要重新生成字体时运行 `node scripts/build-douyin.mjs --font`，本机使用 `.local/font-tools/` 的 fontTools。
- `A3_DOUYIN_API_BASE` 可覆盖构建时的 HTTPS API，默认为 `https://a3.vibelink.cloud/api`。固定入口服务增加了 `/api/` 转发到本机游戏服务的支持，由启动器传入实际游戏端口。此改动需重启入口服务生效；当前运行入口尚未重载，抖音后台 request 合法域名和真实多人联机仍待配置验证。

2026-11-14：个人开发者认证已通过，后台已创建「像素A3」，图标、真实玩法介绍及「棋牌桌游／扑克牌」分类已保存为基础信息草稿，题材为「其他」。用户确认没有本游戏软著证书；后台明确所有游戏须通过软著审核，且需完成游戏备案与 ICP 备案后才能上线。官方 CLI 测试上传遇到接口兼容错误，尚未成功生成后台测试版本，也未提交基础信息或版本审核。手机真机／官方模拟器验证仍待完成。本地自动化预览不代表已通过这些环节。

## 规则范围

采用文档主规则：单、对、三、五张八类牌型；3 最大、2 次大，顺子 34567 至 10JQKA；同花按最大牌；每局 ♦4 首出；隐藏身份、暗独食、逆时针、过牌后可再出、下家接风、报单可压必打；2v2 与独食基础分制。

多局连打并累计积分。进贡／还贡采用共享规则引擎：2v2 全胜／全败为大贡，两名输方各交 2 张、两名赢方各收 2 张；半胜／半败为小贡，各交、各收 1 张；1、4 名同队为平局，不贡。独食全胜／全败与其余每家交换 2 张，半胜／半败交换 1 张。进贡者自动交出除 ♠A、♠3 外最大的牌到同一牌池。多名受贡者自由预选足额贡牌，全部无冲突后统一分牌；有冲突时可改选协商，或由冲突双方发起猜拳，手势双方提交后才公开、平手重来。胜者锁定预选，败者从剩余牌重选。真人需先手动选手势，再确认出拳，平手后重新手动选择。受贡者逐张向所收贡牌的原交牌者等量返还，可退原贡牌，禁止返还 ♠A、♠3、♦4。单名受贡者直接收取全部贡牌。不设免贡／抗贡。全部还完每人 13 张，♦4 持有者首出。结算正确显示独食身份，自动补齐名次仅用于内部计算，界面不显示“补位”。真正出完牌后可只读查看仍在局中的队友手牌，未出完者、补名次者和独食者不开放；对手手牌始终不可见。不启用叫独食／摆牌倍数、投降和地方变体。2v2 任一队出完即结算，独食者出完或其他三人出完时结算。

## 目录

- `src/core/game.ts`：无平台依赖的规则、状态机、合法出牌枚举和公开视图。
- `src/core/avatar.ts`：人物形象的数据定义、校验和像素生成，Web、服务端、小程序共用。
- `src/visual/table.ts`：两端共享的程序化 3D 场景。
- `src/web/`：Web 页面、响应式手牌、机器人、房间与重连。
- `src/web/scene/`：Web 专用方块像素风 3D 场景。`pixels.ts` 生成 16×16 方块纹理，`world.ts` 搭体素峰林、小岛、茶亭和牌桌，`figures.ts` 按形象拼方块人，`cards.ts` 画像素扑克，`stage.ts` 负责镜头（大厅 / 牌桌 / 换装）、手牌与发牌出牌动画。
- `src/web/account.ts`：账号面板（邮箱、扫码、资料、局域网二维码、积分榜、手机端扫码确认页）。
- `src/web/chat.ts`：「茶亭闲话」聊天面板：快捷语、表情、头顶气泡；好友房消息存 PostgreSQL `room_messages`（需登录凭证、1–60 字、去除控制字符、每座位 0.8 秒限频），练习桌由机器人应答。
- `src/web/audio.ts`：Web Audio 程序化牌声、木鱼过牌、铜铃／铜锣与江水虫鸣；声音面板中的方块留声机支持 4 首 CC0 钢琴／氛围音乐、上一首／下一首、选曲、暂停、进度、音乐音量与列表／随机／单曲循环，记住上次选择。Web／安卓内置音频可离线播放，小程序／抖音通过游戏服务器的 `/audio/` 播放，声音与牌局音效分别控制。
- `server/`：Express API、PostgreSQL schema 和迁移；`server/auth.ts` 是账号、会话、扫码票据与微信接口。
- `miniprogram/`：原生小程序 WXML/WXSS 与 TypeScript 源文件。
- `public/assets/`：自制 SVG 牌面、牌背、纹饰；`scripts/generate-cards.mjs` 可重建 52 张牌面。
- `tests/`：规则和浏览器测试；`artifacts/`：界面验证截图。

## 安卓应用

安卓端用 Capacitor 把 Web 端原样打包成原生应用（包名 `cloud.vibelink.a3`）：同一套方块 3D 场景、换装、账号和牌桌代码，画面与 Web 端一致；页面资源在安装包内，只有接口走网络。与 Web、小程序共用同一个服务端和账号，三端互通。

- **安装包**：`release/shanshui-a3-<版本>.apk`，拷到手机安装（需允许「安装未知来源应用」）。支持 Android 7.0 及以上。
- **发布下载**：玩家打开 https://a3.vibelink.cloud/download/ ，页面按钮指向 [GitHub Releases](https://github.com/Cosm1cAC/guangxi-a3/releases) 的正式 APK。安装包下载不经过本机穿透带宽；下载速度取决于玩家到 GitHub 的网络。
- **发布元数据**：打好正式包后运行 `node scripts/android-release.mjs`，生成 `public/download/release.json`，并准备 `release/shanshui-a3.apk` 和 SHA-256 附件。然后提交源码、创建对应 `v<版本>` Release，并上传这两个附件；页面使用该版本的不可变下载链接。
- **打包**：`npm run apk`（调试包加 `-- --debug`）。需要 JDK 17+ 和 Android SDK（装 Android Studio 即可，脚本会自动寻找）。Gradle 发行包与依赖走腾讯 / 阿里镜像。
- **服务器地址**：应用启动时先向固定入口 `https://a3.vibelink.cloud/go/target.json`（`.env.app` 的 `VITE_ENTRY_URL`）询问当前牌桌地址，所以国内穿透的地址变了也不用重装或手填；连不上时会重新询问。入口问不到时沿用上次的地址，再退回 `VITE_API_BASE`（`https://a3.vibelink.cloud/api`，对应 `公网启动.cmd` 的直连方式）。应用内登录窗口底部「服务器 · 更改」可改成局域网里的本机服务（如 `http://192.168.1.10:3001`），留空恢复默认。
- **签名密钥**：首次打包自动生成 `.local/android/a3-release.jks`，密码在 `android/keystore.properties`，两者都不进版本库。**请备份**：丢了密钥，已安装的应用就无法覆盖升级，只能卸载重装。
- 应用内全屏沉浸、牌局中屏幕常亮、避让挖孔屏。图标由 `node scripts/android-assets.mjs` 从徽标生成。
- 应用内没有微信登录（「微信扫码」页签需要另一台设备来扫，手机上请用邮箱登录）。上架应用商店需要软著、备案等资质，目前只提供安装包。

## 挂到公网（Cloudflare Tunnel）

### 免费固定入口（当前使用）

长期分享 **https://a3.vibelink.cloud/go/**，也可以用域名首页。它在本机 3003 提供不缓存的 302 跳转，只让进入时的一次请求经过 Cloudflare；浏览器随后直接连接当前 cpolar 地址，对局数据不经 Cloudflare 转发。需要电脑、本机入口服务和两条隧道保持运行。

双击 `穿透启动.cmd` 或 `公网启动.cmd` 即可一起启动。cpolar 分配新地址时，启动器先检查新地址的 HTTPS 健康接口，通过后自动更新 `.local/cpolar/public.json`、`public/go/target.json` 和 `dist/go/target.json`；固定入口每次读取当前目标，不使用永久跳转。重连期间可能短暂不可用，重新从固定入口进入即可。浏览器地址栏最终仍是 cpolar 地址；地址变化后本地登录状态可能需要重新登录，账号／对局保存在同一本机数据库。

Cloudflare 固定入口配置在 `.local/cloudflared/entry-config.yml`，原配置备份为 `.local/cloudflared/config.pre-entry.yml`。启动时会测量20个官方 Tunnel 候选 IP 的 TCP 7844 连接质量，并从无失败、握手中位数不超过350ms的候选中选择最快4个；没有足够合格候选时使用默认发现。当前版本的 `edge` 参数在官方源码中标为内部测试功能，已在本机版本实测连接，但不作为跨版本保证。Cloudflare 地址仍是 Anycast，此筛选仅代表本机当时线路，不能保证每个玩家都连接同一机房。

`CF节点测速.cmd` 可额外测访客侧 HTTPS IP，并保存报告到 `.local/cloudflared/benchmark.json`。访客侧测速仅生成报告，不改 Windows hosts 或 DNS；不能把 Tunnel 的 7844 地址和网站的 443 地址混用。游戏服务器将来迁移到云端时，可再调整固定入口目标与域名部署方案。

### 国内内网穿透（cpolar）

用于替换访问延迟较高的 Cloudflare 链路，游戏和 PostgreSQL 仍运行在本机。先用免费随机 HTTPS 地址测试效果；不要求路由器端口映射或公网 IP。

1. 在 [cpolar 官网](https://www.cpolar.com/) 免费注册，后台“验证”页复制 Authtoken。
2. 双击 `配置穿透.cmd`，在本机隐藏输入框中粘贴 Token，保存到 `.local/cpolar/auth.yml`。无需把 Token 发到聊天或放进 `.env.app`。
3. 双击 `穿透启动.cmd`（`node scripts/start.mjs --cpolar`）。会构建当前游戏、启动本机服务、连接国内 `cn` 节点，并启动 Cloudflare 固定入口。取得并检查 HTTPS 地址后自动打开固定入口；免费隧道地址变化后自动更新跳转目标。

cpolar 客户端位于 `.local/cpolar/cpolar.exe`。本机从官网 Windows 64 位安装包中解出单独的可执行文件，已验证安装包及程序的数字签名；没有安装 Windows 服务或默认示例隧道。其他电脑需从 [官方下载页](https://www.cpolar.com/download) 获取客户端。启动器只映射游戏端口，禁用请求记录，检查接口只绑定本机回环地址，关闭 cpolar 后台；独立启动的客户端不继承系统 HTTP／SOCKS 代理。

`穿透启动.cmd` 与 `公网启动.cmd` 默认使用 3002，可通过 `PORT` 覆盖；固定跳转服务使用 3003；同时在固定域名下提供 `/api/` 和支持 byte range 的 `/audio/`，供原生客户端使用。直接运行 `node scripts/start.mjs --cpolar` 时，仍以 `PORT`／`.env`／默认 3001 为准。保持启动窗口开启；Ctrl+C 关闭本次服务与隧道。端口被占用时脚本报错，不会停止其他服务。域名 DNS 维持原有 Cloudflare 隧道记录。

官网免费版当前为 1Mbps、随机地址；固定域名与更多带宽有套餐限制，先实测再选择。当前先使用服务商分配的地址，没有绑定原来的 `a3.vibelink.cloud`。安卓应用可在“服务器·更改”填入新的 HTTPS 地址；真实微信扫码的回调域名也需在平台侧匹配，随机地址仅适合测试。

### 本机直连（不经过 Cloudflare）

双击 `直连启动.cmd`，或运行 `node scripts/start.mjs --direct`。它构建网页并让本机 API 同时提供网页和接口，不启动 Vite 或 Cloudflare。默认端口 3001；若端口被占用，脚本会报错，不会停止已有服务。启动后，同一 Wi‑Fi 的设备打开 `http://192.168.5.2:3001`（以启动窗口实际地址为准）。

外网 IPv4 直连需要路由器有可入站的公网 IPv4，并配置 TCP 端口映射：外部端口 → 电脑局域网 IP 的 3001。给电脑设置 DHCP 地址保留，Windows 防火墙仅放行游戏端口。WAN 地址若为 10.*、192.168.*、172.16–31.* 或 100.64–127.*，还需处理上级路由／运营商 NAT；只在当前路由器映射端口不足以保证外网可达。用手机关闭 Wi‑Fi、走移动网络验证，不能仅凭局域网内访问判定。

有公网入口后，可用单独的 A 记录指向公网 IPv4，并设为 DNS only（关闭代理），避免 Cloudflare 转发流量。公网账号登录应在本机部署可信 HTTPS 反向代理，转发至 `127.0.0.1:3001`；不要使用仅供 Cloudflare 回源的 Origin CA 证书。可在 `.env` 设置 `A3_DIRECT_URL=https://你的直连域名`，用于回调地址；IPv4、端口映射、DNS 和证书需自行配置，启动器不会自动更改网络设置。当前默认监听 IPv4，IPv6 直连还需配置监听、防火墙及 AAAA。

### Cloudflare 隧道入口

服务仍然跑在本机，由 `cloudflared` 建一条出站隧道，把 `https://a3.vibelink.cloud` 接到本机 `3001` 端口；不需要公网 IP 或端口映射，HTTPS 证书由 Cloudflare 提供。

- 当前日常使用：双击 **`公网启动.cmd`** 或 **`穿透启动.cmd`**，均启动上面的免费固定入口方案。以下全流量 Cloudflare 的记录保留作历史参考；若要恢复旧方式，先将 `config.pre-entry.yml` 恢复为 `config.yml`，再运行 `node scripts/start.mjs --public`。电脑关机后服务不可访问。
- 公网模式强制关闭「模拟扫码」，限流按 Cloudflare 传来的真实访客 IP 计算。
- 隧道配置在 `.local/cloudflared/`（`config.yml`、隧道凭证、`public.json`），不进版本库。换域名：`cloudflared tunnel route dns a3-vibelink 新子域名`，并同步修改 `config.yml` 与 `public.json` 里的 hostname。
- 已知限制：本机网络到 Cloudflare 的跨境链路丢包明显（隧道落在洛杉矶节点）。2026-11-14 实测服务端处理约 50 ms，但经公网约四分之一请求超时、其余 1–9 秒。隧道已固定走 HTTP/2（QUIC 会被断开），客户端对读请求自动重试。有公网入口时可改用上面的本机直连；没有公网入口时需联系运营商，或使用距离更近的服务器／中转。公网模式会在启动窗口打印访问日志（方法、路径、状态码、耗时、访客 IP）。
- 公网开放注册后，建议在 `.env` 配置 SMTP 开启邮箱验证码，避免被批量注册。

### 接入真实微信扫码登录

代码已接好，缺的是只有主体本人能申请的微信凭证：

1. 在 [微信开放平台](https://open.weixin.qq.com) 注册并完成**开发者资质认证**（需企业 / 个体工商户等主体，个人主体不能申请网站应用的微信登录；认证费 300 元 / 年）。
2. 「管理中心 → 网站应用 → 创建网站应用」，官网填 `https://a3.vibelink.cloud`，**授权回调域**填 `a3.vibelink.cloud`（只填域名，不带 https:// 和路径）。提交后等待审核。
3. 审核通过后把 AppID、AppSecret 写进 `.env`：

   ```
   WECHAT_APP_ID=wx…
   WECHAT_APP_SECRET=…
   ```

   公网模式下回调地址默认就是 `https://a3.vibelink.cloud/api/auth/wechat/callback`，无需再设 `WECHAT_REDIRECT_BASE`。重新运行 `公网启动.cmd`，登录窗口的「微信扫码」即显示微信官方二维码。
4. 想让小程序与网站是同一个账号：在开放平台把小程序绑定到同一开放平台账号，并在 `.env` 填 `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET`，两边按 unionid 归并。

## 后端与部署

配置 `DATABASE_URL`，执行迁移后 `npm run build`。生产环境安装运行依赖与 tsx，使用 `npx tsx server/index.ts` 启动，Node 同时提供 `dist/` 静态 Web。反向代理配置 HTTPS；小程序请求同一 `/api` 服务。不使用 Redis、SQLite 或云端替代数据库。

房间与完整规则状态存 PostgreSQL JSONB；动作事务使用 `SELECT … FOR UPDATE`，检查版本号防止并发重复操作；会话令牌为随机 256 位、数据库只存哈希；响应隐藏其他玩家手牌和阵营。完成对局写入 `match_results` 并累计到 `users`。

当前为可玩的开发版：没有找回密码、匹配、离线托管、超时踢人、房间清理任务或聊天敏感词过滤；真实微信扫码与小程序微信登录的代码已接好，但需要你自己的 AppID 才能启用，未做过真实微信环境验证。本机服务走 HTTP，账号密码只适合在可信的局域网内使用；对公网开放前请配置 HTTPS 反向代理。断线玩家需要重新登录继续，不能替换。发布前需要自己的 AppID、HTTPS 域名、部署环境和真机验证。
