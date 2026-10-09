# JESCO 电商发票助手

正式版本：0.5.16

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

0.5.16：未知商品类别会在助手浮窗中等待人工选择已有模板；保存后记住映射并继续当前发票。默认不预选类别，也不预置 MAGLIONE 的归类。映射保存在当前浏览器，与订单池分开保存，两平台共用；扫描逻辑不变。旧下载链接继续兼容。

这里只发布已验证的正式版本，开发中的文件不自动发布。历史版本可从 GitHub 提交记录查看。

## 文件完整性

文件：invoice-automation.user.js

SHA-256：`b0f85315738d3e928548b9c27592a69b683c474e91eb4c6611da6305f2dc0239`

[校验清单](https://jescod111.github.io/jesco-invoice-assistant/release.json)
