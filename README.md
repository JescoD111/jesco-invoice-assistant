# JESCO 电商发票助手

正式版本：0.5.18

## 安装与更新

打开 **[官方安装页](https://jescod111.github.io/jesco-invoice-assistant/)**，先安装 Tampermonkey，再点击“安装 / 更新助手”。无需复制代码，也无需 GitHub 账号。

[安装 / 更新助手](https://jescod111.github.io/jesco-invoice-assistant/invoice-automation.user.js)

现有用户请在原浏览器中更新，不要先删除旧脚本；确认名称是“JESCO 电商发票助手”，避免重复安装。更新后结束当前任务再刷新业务页面。更新不清空订单池和国家映射。

篡改猴根据脚本的版本号和 updateURL / downloadURL 检查更新；也可在篡改猴管理面板手动检查。自动更新取决于本机设置，不保证发布后即时更新。

## 功能范围

FashionPO、PFS 订单扫描、客户核验及 Fatture in Cloud 发票辅助填写。商品模板代码、发票模板名称需在使用的公司账号中存在。税务设置和发票内容仍需人工审核。

本仓库只发布程序、安装页及校验信息，不含客户、订单、账号密码或登录令牌。脚本在使用者的浏览器运行，登录状态和业务请求仅用于对应平台，不将订单提交给本安装站点。

脚本在普通 HTTP/HTTPS 网页注册打开菜单；业务操作仅在三个支持的平台执行。浏览器内部页不会运行脚本。

## 发布说明

0.5.18：PFS 扫描先读取待上传发票专区，再核对全部已确认订单，按订单 ID 去重并补上专区漏列的未上传发票订单；即使专区为空或两边数量相同也会核对。已上传发票的订单仍排除。核对失败或上传状态不明确时明确提示，不当作没有新订单。FashionPO、客户与商品信息读取以及开票流程不变；更新后刷新 PFS 并重新扫描即可，无需清空任务池。旧下载链接继续兼容。

这里只发布已验证的正式版本，开发中的文件不自动发布。历史版本可从 GitHub 提交记录查看。

## 文件完整性

文件：invoice-automation.user.js

SHA-256：`29ee32f5cfe7d9de0576f0d89f8334ef2fc300f1ecaf5522a6d51e11c70e77f5`

[校验清单](https://jescod111.github.io/jesco-invoice-assistant/release.json)
