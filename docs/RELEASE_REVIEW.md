# 审阅与发布

项目仓库：[Preserved-egg-cc/research-knowledge-helper](https://github.com/Preserved-egg-cc/research-knowledge-helper)。以下流程用于后续更新的审阅与发布。

## 先检查这些文件

| 审阅内容 | 入口 |
| --- | --- |
| 功能、限制和使用方式 | [README](../README.md) |
| 普通同学安装与更新 | [Chrome 安装教程](CHROME_INSTALL.md) |
| 运行时数据与提交记录 | [隐私说明](PRIVACY.md) |
| 代码和资料许可边界 | [资料许可](DATA_LICENSE.md)、[NOTICE](../NOTICE) |
| 题目、答案和官方依据 | [资料库入口](../knowledge_base/README.md) |
| 自动检查结果 | [本地检查汇总](../reports/LOCAL_CHECKS.md)、[构建结果](../reports/build.json)、[目录检查](../reports/release_check.json) |

确认姓名/班级、私人答卷、原始截图、结果页令牌和本机目录没有进入待发布文件。官方作者或机构的必要署名属于出处信息，应保留。

确认拟分发资料的再分发条件。MIT 仅覆盖项目代码及自写使用文档；当前数据没有被统一声明为开放许可。若部分材料不能公开，应先移除或改为使用者自行导入，并更新引用、测试和答案包。

## 审阅通过后的流程

1. 确定 GitHub 仓库归属、名称、公开范围和拟分发数据范围。
2. 用最终文件重新运行检查与打包，核对 ZIP 清单。只上传此独立项目，不能从原私人工作目录整体提交。
3. 检查 Git 待提交清单和远程地址；不要包含本地隐私扫描词表、缓存或 `dist/`。
4. 经维护者明确同意后，才创建远程仓库并推送；另行决定是否发布附带 ZIP 的 GitHub release。
5. 运行远程 CI，配置安全报告渠道，更新发布版本说明。

源码仓库与 release 附件需要分别审阅。当前项目没有自动上传或自动发布的工作流。
