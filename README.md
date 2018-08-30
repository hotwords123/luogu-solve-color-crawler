# 洛谷做题情况爬虫&统计器

## 爬虫简介

#### 这是一个为了让OIer们更加清楚地了解自己在洛谷上的做题情况而编写的爬虫(当然，它也可以轻易地被移植到其它OJ上)。

#### 这个爬虫除了能全自动爬取做题情况(自带错误处理,首次爬取失败后进行3次重试)，还能把爬取结果输出到HTML页面来进一步分析。

## 食用指南

### 0. 写在前面

**重要：请勿滥用爬虫，否则由此带来的一切后果自负！！！**

### 1. 首先把项目clone到自己电脑上，推荐使用git(当然你也可以偷懒选择Download ZIP)：

```bash
git clone https://github.com/hotwords123/luogu-solve-color-crawler.git
```

### 2. 然后安装所需的模块(先切换到项目目录下)：

```bash
npm install
```

#### P.S. x1 没有Node.js？

[猛戳这里，zip或msi均可，Linux&MacOS党当我没说](http://nodejs.cn/download/)

**提示：把Node.js加到环境变量Path里！**

#### P.S. x2 如何快速切换目录？

- **暴力cd** 不多说，大家都会

- **划重点** 打开项目文件夹，Shift+右键，猛戳"在此处打开命令行窗口"

### 3. 获得你的洛谷UID(最简单的一步)：

打开你的个人空间，查看浏览器地址栏，你会看到类似`https://www.luogu.org/space/show?uid=<你的UID>`的东西，那个UID就是你的UID。

#### P.S. 如何获得别人的洛谷UID？

打开私信，输入他的用户名，点进他的个人空间，其余步骤同上。

### 4. 开始爬取！(这才是最简单的一步)

启动爬虫(同样先切换到项目目录下):

`npm start`或`node main.js`

然后等待跳出`User ID:`，输入你的UID，回车即开始爬取。

爬取过程中会不断出现类似`Crawling problem xxxx (a of b)...`的提示，表示当前进度。

`Error: xxx`说明爬取某题失败:

- `Request Timeout`: 请求超时(一般为偶发情况)

- `Response Timeout`: 响应超时(一般为偶发情况)

- `HTTP Error XXX`: HTTP状态码不是200时报出，一般是302说明题目不存在之类的

- 其它奇奇gay gay的东西: 可能是bug

默认会重试最多3次: `Retry x/x...`

如果出现`Failed to crawl`提示，说明爬取失败，确认是bug后，可以把出现的错误信息截图发一个issue。

如果出现`Results saved to xxx`就说明爬完了，可以到相应目录下查看结果文件。

### 各文件夹用途：

`node_modules` 存放Node.js模块，**第2步中生成**

`results_raw` 存放爬完的原始数据(json格式)

`results` 存放文本分析结果

`results_html` 存放网页结果

**(以上三个文件夹在爬完一次后生成)**

`view` 原始数据查看器

食用方法: 打开view文件夹下的index.html，点击上方的蓝色区域，把原始数据选进去即可。
