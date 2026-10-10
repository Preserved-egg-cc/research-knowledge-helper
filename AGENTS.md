# 项目约定

先读 README.md、docs/AGENT_GUIDE.md 和 knowledge_base/CONFLICTS.md。

- 保留题干的否定词、数字、单位、完整选项及制度版本；按答案文字处理换序。
- 不用相似题自动猜答案；未知或冲突只列出题号，保留原有输入。
- 只编辑去身份的公开输入，不添加私人答卷、个人身份、结果令牌或原图。
- 代码与数据许可分开。新增资料记录公开出处、适用范围和再分发状态。
- 修改资料后运行 `python -X utf8 scripts/test.py`。生成物由 scripts/build.py 重建。
- 私人浏览器导出放在仓库外。不要通过复制原工作目录制作公开包。
- 本地打包不会上传。只有使用者审核并明确要求后才可发布。

无需模型密钥。CLI：`python -X utf8 knowledge_base/kb.py search "题目" --top-k 5 --format json`。
