# 论文写作助手

一个面向论文写作流程的小网站，支持：

- 项目信息管理
- 开题报告解析
- 论文大纲生成
- 分章节写作
- 参考文献管理
- 检查润色
- 进度看板
- Supabase 账号登录与云端保存

## GitHub Pages 部署

1. 新建 GitHub 仓库，例如 `paper-writing-assistant`
2. 上传以下文件：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
   - `README.md`
3. 进入仓库 Settings -> Pages
4. Source 选择 `Deploy from a branch`
5. Branch 选择 `main`，目录选择 `/root`
6. 保存后等待几分钟
7. 打开 GitHub Pages 生成的网址

## Supabase 数据库

数据库建表脚本在 `supabase-schema.sql`。

注意：前端只允许使用 Supabase `anon public key`，不要使用 `service_role` 或 secret key。
