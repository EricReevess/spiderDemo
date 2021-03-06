class TaskQueue {
  constructor({ delay, timeout }) {
    this.timer = null;//当有任务执行时，设置超时检测的定时器
    this.resolved = true
    this.executeNext = false
    this.waitingQueue = [];//等待任务的队列
    this.execute = (task, resolve, reject) => {
      this.resolved = false;//记录任务是否结束
      task().then((data) => {
        //任务未超时，则会进入这里
        resolve(data);
        this.resolved = true;//标记任务完成
        console.log('任务完成')
        clearTimeout(this.timer);//清除超时计时器
        this.timer = null;
        if (this.executeNext) {//true代表任务是在delay后完成的，所以直接执行下一个任务
          const next = this.waitingQueue.shift();
          if (next) {
            this.execute(next.task, next.resolve, next.reject)
          }
        }
      })

      // timer中的代码为处理超时的情况
      this.timer = setTimeout(() => {
        // 这里不需要调用reject，直接将得到的内容返回为超时
        resolve('超时');
        this.timer = null;
        const next = this.waitingQueue.shift();
        if (next) {//立即执行下一个任务
          this.execute(next.task, next.resolve, next.reject)
        }
      }, timeout)
      //执行从定时器开始，delay时间后，自动执行下一个任务
      setTimeout(() => {
        if (this.resolved) {//true代表上一个任务已经完成，可以直接执行下一个任务
          const next = this.waitingQueue.shift();
          if (next) {
            this.execute(next.task, next.resolve, next.reject)
          }
        }
        this.executeNext = true;//标记当前任务完成后，立即执行下个任务（给任务在delay之后完成用）
      }, delay)
    }

  }
  // 添加任务方法，参数task为一个返回值是promise的函数
  add (task) {
    return new Promise((resolve, reject) => {
      if (!this.timer) {//没有任务，则直接执行
        this.execute(task, resolve, reject);
      } else {//否则 将任务放入等待队列中
        this.waitingQueue.push({ task, resolve, reject })
      }
    }).then((data) => {
      return data
    })
  }
  // 当前队列是否已经处于闲置状态
  isEmpty () {
    return (!this.waitingQueue.length) && this.resolved
  }
  // 返回当前剩余任务数量，不包括在执行的任务
  getRemainingTaskCount () {
    return this.waitingQueue.length
  }
  // 返回当前队列是否有任务正在处理
  isRunningTask () {
    return !this.resolved
  }
}

module.exports = TaskQueue

/*
const task1 = () =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('task1');
    }, 3000);
  });
const task2 = () =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('task2');
    }, 2000);
  });
const task3 = () =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('task3');
    }, 1000);
  });
*/

/*const queue = new Queue({delay:1000,timeout:3000});


queue.add(task1).then((data) => console.log(data))
queue.add(task2).then((data) => console.log(data))
queue.add(task3).then((data) => console.log(data))
console.log(queue.isEmpty())*/

