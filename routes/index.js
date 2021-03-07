let express = require('express')
let router = express.Router()
let json = require('jsonify')
// 引入所需要的第三方包
let superagent = require('superagent')
//superagent.buffer[mime] = false
// 引入所需要的第三方包
let cheerio = require('cheerio')
let TaskQueue = require('./TaskQueue')
let hotNews = []                                // 热点新闻
let newsData = []
let specialNewsTempObjArray = []
let responseTimer
const requestTaskQueue = new TaskQueue({ delay: 0, timeout: 3000 }) // 请求队列

/*
* newsData对象数组 元素结构：
* {
    id:字符串 ,
    title:字符串 ,
    url:`https://new.qq.com/rain/a/xxxxxxxxxx.html`,
    category:字符串 ,
    tags: getTags(x),
    keywords: 关键字字符串，用逗号隔开
    media:字符串 ,
    publish_time: 时间戳,
    article_type: 整数数字，
    newsContentArray：新闻文字内容数组，一行文字的字符串为一个数组元素
  }*/

/* GET / page. */
router.get('/', function (req, res, next) {

  superagent
    .get('https://i.news.qq.com/trpc.qqnews_web.kv_srv.kv_srv_http_proxy/list')
    .query({
      sub_srv_id: '24hours',  // 新闻类型
      srv_id: 'pc', //网页客户端平台
      offset: '10', // 位移
      limit: '10', // 每次抓取的数量限制
      strategy: '1', ext: '{"pool":["high","top"],"is_filter":10,"check_type":true}'

    })
    .then((res, err) => {
      if (err) {
        // 如果访问失败或者出错，会这行这里
        console.log(`热点新闻抓取失败 - ${err}`)
      } else {
        // 抓取热点新闻数据
        let newsObj // 展示存储JSON的对象
        newsObj = JSON.parse(res.text)
        if (newsObj['msg'] && newsObj['msg'] === 'success') {
          hotNews = newsObj['data']['list'].slice(0)
        }

        hotNews.forEach((item, idx) => {
          newsData.push({
            id: item.cms_id,
            title: item.title,
            url: `https://new.qq.com/rain/a/${item.cms_id}.html`,
            category: item.category_cn,
            tags: getTags(item.tags), // 先提取接口中的标签数据
            media: item.media_name,
            publish_time: item.publish_time,
            article_type: item.article_type
          })

        })

        for (let i = 0; i < newsData.length; i++) {
          //任务1：请求新闻信息接口
          requestTaskQueue.add(() => new Promise((resolve, reject) => {
            superagent
              .get(newsData[i]['url'])
              .then((res, err) => {
                if (err) {
                  resolve('抓取失败')
                  console.log(`url${i}内容抓取失败 - ${err}`)
                } else {
                  let newsContentArray = []
                  let newsContent
                  let $ = cheerio.load(res.text)
                  newsContent = $('.qq_conent .content-article .one-p')
                  // 如果文章类型不为0，可能是重定向url的专题页面
                  if (!newsContent.length) {
                    console.log('进入到专题类型新闻页面解析')
                    requestTaskQueue.add(() => new Promise((resolve, reject) => {
                      let newsPageId = newsData[i]['id']
                      // 查看是否为多个新闻列表的专题页面
                      console.log('向查询接口发送请求，判断是否为多个列表的专题新闻页面')
                      superagent
                        .get('https://pacaio.match.qq.com/openapi/getQQNewsSpecialListItems')
                        .query({
                          id: newsPageId,
                        })
                        .then((res, err) => {
                          if (err) {
                            console.log(`内容抓取失败 - ${err}`)
                          } else {
                            console.log('开始解析接口数据，生成专题新闻组信息数组')
                            newsObj = json.parse(res.text)

                            newsObj['data']['idlist'] && Array.from(newsObj['data']['idlist']).forEach(item => {
                              item['newslist'].forEach(item => {
                                // 如果item有source信息，执行录入
                                // 通过查询的JSON信息中初始化专题新闻的信息
                                item['source'] && specialNewsTempObjArray.push({
                                  id: item.id,
                                  title: item.title,
                                  url: `https://new.qq.com/rain/a/${item.id}.html`,
                                  category: newsData[i]['category'],
                                  media: item.source,
                                  publish_time: item.time,
                                  article_type: item.articletype,
                                })
                              })
                            })

                            resolve('接口解析完毕')
                            //开始解析专题子页面，先判断是否有生成的数据
                            if (specialNewsTempObjArray.length) {
                              specialNewsTempObjArray.forEach((item, idx, array) => {
                                requestTaskQueue.add(() => new Promise((resolve, reject) => {
                                  superagent
                                    .get(item['url'])
                                    .then((res, err) => {
                                      if (err) {
                                        console.log(`新闻内容抓取失败: ${err}`)
                                      } else {
                                        console.log('开始解析专题新闻子页面')
                                        let $ = cheerio.load(res.text)
                                        let newsContent = $('.qq_conent .content-article .one-p')
                                        if (newsContent.length) {
                                          let regExp = /(DATA = {)([\w\W]*?)}/g
                                          // 匹配到script标签中的信息字段
                                          let matchResult = res.text.match(regExp)
                                          let scriptInfo = matchResult ? matchResult[0].slice(7) : '{}'
                                          let scriptInfoObj = JSON.parse(scriptInfo)
                                          array[idx]['tags'] = scriptInfoObj['tags'].split(',') // 提出标签
                                          handleNewsContent(array, newsContent, newsContentArray, $, idx)
                                          newsContentArray = []
                                          resolve('专题子页面新闻抓取成功')
                                        }
                                      }
                                    }).catch(reason => {
                                    console.log(reason)
                                  })
                                }).then(result => {
                                  console.log(result)
                                }))
                              })
                              newsData.splice(i, 1, ...specialNewsTempObjArray.slice(0))
                              //newsData[i]['specialNewsArray'] = specialNewsTempObjArray.slice(0)
                              specialNewsTempObjArray = []
                            }
                          }
                        })
                    }).then(result => {
                      console.log(result)
                    }).catch(reason => {
                      console.log(reason)
                    }))
                  } else {
                    //console.log(JSON.parse(res.text.match(/(DATA = {)([\w\W]*?)}/g)[0].slice(7)) ) //添加问号为惰性匹配
                    handleNewsContent(newsData, newsContent, newsContentArray, $, i)
                    resolve('普通页面新闻抓取成功')
                  }
                }
              })
          })
            .then(result => {
              console.log(result)
            }))
            .then(() => {

            })
        }
      }
    })


  responseTimer = setInterval(() => {
    if (requestTaskQueue.isEmpty()) {
      console.log('爬取完毕，将数据响应给浏览器')
      //console.log(newsData)
      res.json({
        status: 0, data: newsData,
      })
      clearInterval(responseTimer)
      responseTimer = null
    }
    /*console.log('任务剩余个数',requestTaskQueue.getRemainingTaskCount())
    console.log('是否在执行',requestTaskQueue.isRunningTask())*/
  }, 3000)

})

router.get('/getQueueStatus', ((req, res, next) => {
  res.json({
    isRunning: requestTaskQueue.isRunningTask(), RemainingTasksCount: requestTaskQueue.getRemainingTaskCount(),
  })
}))

const getTags = (tagsArray) => {
  const tags = []
  if (tagsArray.length) {
    tagsArray.forEach(item => {
      tags.push(item.tag_word)
    })
  }
  return tags
}

const getKeywords = ($) => {
  return $ ? $('meta[name=keywords]').attr('content') : ''
}


function handleNewsContent (newsData, newsContent, newsContentArray, $, i) {
  if (newsContent.length) {
    newsContent.each((idx, ele) => {
      newsContentArray.push($(ele).text())
    })
  } else {
    newsContentArray.push('新闻内容可能为纯视频或者图片等非文本要素，请访问url查看')
  }
  newsData[i]['newsContentArray'] = newsContentArray.slice(0)
  newsData[i]['keywords'] = getKeywords($)
  /*console.log('新闻id：', newsData[i]['id'])
  console.log('新闻url：', newsData[i]['url'])
  console.log('文字类型：', newsData[i]['article_type'])
  console.log('新闻标题：', newsData[i]['title'])
  console.log('新闻分类：', newsData[i]['category'])
  console.log('新闻关键词：', newsData[i]['keywords'])
  console.log('新闻标签：', newsData[i]['tags'])
  console.log('新闻内容：', newsData[i]['newsContentArray'])*/
}

function keywordFilter(keyword,newsData){

}

// 模糊匹配[\u4e00-\u9fa5a-zA-Z0-9]*keyword[\u4e00-\u9fa5a-zA-Z0-9]*
module.exports = router
