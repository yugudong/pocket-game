# Repository workflow

- Keep edits local by default. Do not commit, merge, tag, push, or rewrite history unless the human explicitly asks for that operation. A request to edit code alone is not permission to publish it.
- Keep the repository suitable for community contributions. Never commit a real WeChat AppID, AppSecret, account credential, or personal developer configuration.
- `miniprogram/project.config.example.json` is the public template and uses `touristappid`. The generated `miniprogram/project.config.json` and `project.private.config.json` are local, ignored files.
- Run `npm run setup:wechat` to create a local developer-tool configuration. Preserve existing local configuration unless the user explicitly requests changing it.
- Run `npm run check` and relevant tests before proposing a commit. Network session tests must run serially.
- Frozen policies under `tools/fixtures/` are historical test baselines; do not modify them when changing current game behavior.
