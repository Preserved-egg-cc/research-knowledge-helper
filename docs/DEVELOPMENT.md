# 开发与构建

## 环境

- Python 3.10+：检索、构建、数据检查和打包只使用标准库。
- Node.js 24+：运行 JavaScript 测试，不需要安装 npm 依赖。
- Chrome：安装或手动验证扩展。只使用扩展时不需要上述开发环境。

在项目根目录运行：

```sh
python -X utf8 scripts/test.py
python -X utf8 knowledge_base/kb.py validate
python -X utf8 scripts/package.py
```

`scripts/test.py` 依次重建数据、运行 Python 和 JavaScript 测试、检查发布目录。`node` 需要在 PATH 中。`--test-isolation=none` 避免测试环境对子进程的限制；测试不需要浏览器账号或外部网络。

## 数据流程

```text
knowledge_base/data/
  records.jsonl + official_records.jsonl + source_catalog.json
  reviewed_answers.json + conflicts.json + official_conflicts.json + profiles.json
                             |
                       scripts/build.py
                             |
          +------------------+--------------------+
          |                  |                    |
  sources/、questions/    exports/          chrome_extension/data/
  分类 Markdown          上传合订版         answer-pack.json
```

构建输入是此目录中的去身份结构化数据，不读取原工作目录、原始 PDF、截图或历史答卷。重新运行产生相同的答案包和合订版；版本来自 `chrome_extension/manifest.json`。生成文档不要单独编辑。

`reviewed_answers.json` 保存限定问卷的答案、适用范围和引用条款 ID。`profiles.json` 指定三个已适配问卷和预期题量。基础 CLI 检索与扩展答案包的记录集合不同，详见 [Agent 指南](AGENT_GUIDE.md)。

## 代码职责

| 文件 | 职责 |
| --- | --- |
| `chrome_extension/core.js` | 纯函数：归一化、完整匹配、选项文字映射和计划核验 |
| `chrome_extension/adapter.js` | 从已适配网页读取可见表单、填写并核验实际控件 |
| `chrome_extension/content.js` | 页面面板、部分填写流程、显示未匹配项和用户触发提交 |
| `chrome_extension/background.js` | 本机记录与提交尝试锁的串行更新 |
| `knowledge_base/kb.py` | 精确匹配和中文二元组 BM25 检索 |
| `scripts/public_data.py` | 结构化资料和引用完整性检查 |
| `scripts/check_release.py` | 发布文件白名单、敏感字段、可疑令牌及本地链接检查 |

## 验证范围

Python 检查覆盖数据引用、39 条离线检索案例、官方条款召回、选项换序、选项含义变化、隐私字段拒绝和确定性构建。JavaScript 检查覆盖匹配边界、部分填写计划、冲突、答案映射及并发提交锁。检查通过不代表未知题或未来网页结构一定可用。

`chrome_extension/tests/fixture.html` 是匿名本地控件测试页。需要手动核对 DOM 填写时，可运行：

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory chrome_extension
```

然后在浏览器打开 `http://127.0.0.1:8765/tests/fixture.html`，按页面按钮运行。本地页面不向真实问卷提交答卷。结束后在终端按 Ctrl+C 停止服务。

姓名/班级输入的回归页为 `http://127.0.0.1:8765/tests/keyboard.html?activityid=keyboard-test`。它使用真实 `content.js` 和匿名单题表单，模拟宿主页的全局退格拦截。先点击“运行事件回归”，再在两个助手输入框里实际按 Backspace、Delete、Ctrl+A、Ctrl+Z 和 Tab，确认浏览器原生编辑正常；填写核验后修改任一身份字段，应使提交按钮禁用。这个页面的运行环境没有提交接口。

精简面板流程回归页为 `http://127.0.0.1:8765/tests/panel.html?activityid=panel-test`。点击“运行面板回归”检查三个按钮、自动填写、未匹配列表、身份缺失及变化、题面变化、折叠和显式提交。提交只操作本地假按钮，不请求问卷平台；修改测试输入后，刷新页面可重置案例。

GitHub Actions 配置在上传后才可能运行；本地通过不等于远程 CI 已通过。工作流只做检查，不发布扩展、资料或 release。

## 目录与隐私检查

项目忽略本地导出、构建压缩包、缓存、原件和环境文件。`.gitignore` 只是辅助措施；公开前仍需运行发布扫描并人工审阅。

维护者可以在仓库之外保存一个 UTF-8 JSON 字符串数组，列出只用于本地检查的私人词条，然后运行：

```sh
python -X utf8 scripts/check_release.py --deny-file ../private-scan-terms.json
```

该文件不能进入 Git 或 ZIP；脚本报告命中文件和词条序号，不打印私人词条。请勿把真实姓名做成测试断言或公开扫描规则。自动扫描无法识别所有自然语言隐私。

## 打包与发布

`scripts/package.py` 先检查目录，再在 `dist/` 生成源码包、扩展包及 SHA-256 清单，并核对 ZIP 内各文件与源文件一致。扩展包只包含运行文件、答案包和安装/隐私/许可说明；源码包额外包含开发文档和匿名测试。

同一份文件生成的压缩包应相同；任何文档、数据、代码或检查报告变化都会改变校验值。脚本不会创建远程仓库、推送提交或上传 release。发布前事项见[审阅与发布](RELEASE_REVIEW.md)。
