# 口袋桌游

支持局域网联机与智能人机的微信桌游小程序，包含阿瓦隆、掼蛋、斗地主和无间风云。

## 游戏

| 游戏 | 玩法与支持 |
| --- | --- |
| 阿瓦隆 | 5～10 人面对面身份推理、组队、投票与刺杀 |
| 掼蛋 | 四人两副牌、进贡抗贡、升级、逢人配与智能人机 |
| 斗地主 | 三人叫分、出牌、农民配合与智能人机 |
| 无间风云 | 身份推理、调查、装备与射击结算 |

同一 Wi-Fi 或手机热点下创建、搜索和加入房间，也可分享带房间信息的邀请卡片。
游戏业务通信走局域网，无需业务服务器。

## 快速开始

准备 Node.js 22 或更高版本和微信开发者工具。

```sh
git clone https://github.com/yugudong/pocket-game.git
cd pocket-game
npm run setup:wechat
```

在微信开发者工具中导入 `miniprogram/`，选择“小程序”并编译运行。默认使用 `touristappid`；真机调试时，在本机的 `miniprogram/project.config.json` 中填写自己的 AppID。

在项目根目录运行检查与测试：

```sh
npm run check
npm test
```

## 项目结构

```text
miniprogram/       小程序运行源码、规则、人机、局域网会话和页面
tests/             回归测试与牌局夹具
tools/             检查、编译、打包、基准和复盘工具
  fixtures/        用于人机对照的旧版策略快照
  runtime/         可选微信自动化依赖清单
assets/            头像源素材
docs/              玩法、开发说明和精选验证记录
.github/workflows/ Windows / Linux 自动检查
```

## 当前版本

**1.6.10**：优化掼蛋大单、大对和炸弹的保留策略，加强必要拦截、对家配合与两手收尾。

## 社区共建

欢迎通过 Issue 反馈问题，或提交 Pull Request，一起完善游戏规则、人机策略和桌台体验。

## 文档

- [开发环境、命令与 Git 流程](./docs/开发与仓库管理.md)
- [完整玩法与历史开发指南](./docs/游戏与开发指南.md)
- [开发经验与维护记录](./微信小程序开发经验总结.md)
- [版本记录](./CHANGELOG.md)
- [精选验证摘要](./docs/validation/README.md)
