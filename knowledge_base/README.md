# 去身份资料库

本目录包含669条基础资料和255条额外审阅答案。原始PDF、截图、私人答卷及测试过程未分发；引用保留资料ID、适用版本、官方链接和可用的物理页。

- [按来源阅读](sources/README.md)
- [实验室安全](questions/实验室安全.md) · [学生管理](questions/学生管理.md) · [学术道德](questions/学术道德.md)
- [限定问卷的审阅答案](questions/审阅答案.md)
- [来源与版本冲突](CONFLICTS.md)
- [上传合订版](exports/knowledge-base.md)
- [Agent指南](../docs/AGENT_GUIDE.md) · [数据许可](../docs/DATA_LICENSE.md)

运行 `python -X utf8 knowledge_base/kb.py search "题干" --top-k 5 --format json` 检索基础资料，`get <ID>` 查看完整记录。`validate` 验证公开版的数据引用，不会尝试读取原始私人文件。

维护输入为 `data/records.jsonl`、`official_records.jsonl`、`reviewed_answers.json`、`source_catalog.json`、两份冲突清单与 `profiles.json`。执行 `python -X utf8 scripts/build.py` 即可离线重建可读文件、上传版和扩展答案包。原题ID保留，公开版来源位置已改为本目录可读文件；不要与未分发原件的校验值混用。
