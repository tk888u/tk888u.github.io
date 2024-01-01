const http = require('http');
const port = '3013';
const fs = require('fs')

let app = http.createServer(function(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	// res.writeHead(200, { 'Content-Type': 'application/json' });
	res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT, OPTIONS, DELETE, PATCH");
	res.setHeader('Content-Type', 'application/json; charset=utf-8')

	let body = ''
	req.on('data', function(data) {
		body += data
	})

	req.on('end', async function() {
		if (isJSON(body) === true) {
			main()
		} else {
			console.log('JSON 请求失败')
		}
	})

	async function main() {
		// 开始解析传入JSON
		let postParams = JSON.parse(body)
		let result
		// console.log(postParams, typeof body, typeof postParams)
		if (postParams.func === 'enrollUser') {
			return await endResponse(await enrollUser(req))
		} else if (postParams.func === 'findLz') {
			return await endResponse(await findLz(postParams.IP))
		} else if (postParams.func === 'bindAbove') {
			return await endResponse(await bindAbove(postParams.IP, postParams.aboveIP))
		} else if (postParams.func === 'cutLz') {
			return await endResponse(await cutLz(postParams.IP))
		}
	}

	async function endResponse(result) {
		res.setHeader("Access-Control-Allow-Origin", "*")
		res.setHeader('Content-Type', 'application/json; charset=utf-8')
		res.end(result)
	}

	//判断传参是否为JSON
	function isJSON(str) {
		try {
			JSON.parse(str);
			return true;
		} catch (error) {
			return false;
		}
	}

})

app.listen(port, () => {
	console.log('listenPort:', port)
})

// 开始

// 注册
async function enrollUser(req) {
	try {
		const userData = './user/user.json'
		if (!fs.existsSync(userData)) {
			fs.writeFileSync(userData, '[]')
		}

		let IP = req.headers['x-forwarded-for'] || req.connection.remoteAddress
		IP = IP.replace(/\./g, "")

		const time = Date.now()
		// 新用户数据
		const obj = {
			IP,
			lz: 0,
			above: [{
				user: '',
				time: ''
			}],
			underUser: [],
			time
		}

		let userStr = fs.readFileSync(userData, 'utf8') //读取的字符串
		let userArr = JSON.parse(userStr) //解析成数组
		let value = []
		// 搜索匹配的对象 
		if (userArr.some(obj => obj.IP === IP) === false) {
			userArr.push(obj)
			fs.writeFileSync(userData, JSON.stringify(userArr)) //保存文件
			value = [200, '登录成功。']
		} else {
			value = [201, '已经登录。']
		}

		return JSON.stringify({
			code: value[0],
			msg: value[1],
			res: IP
		})
	} catch (e) {
		console.log(e)
		return JSON.stringify({
			code: 500,
			msg: '注册失败'
		})
	}
}

// 查询用户数据 -- (要查询的用户)
async function findLz(IP) {
	try {
		const userData = './user/user.json'
		if (!fs.existsSync(userData)) {
			fs.writeFileSync(userData, '[]')
		}

		let userStr = fs.readFileSync(userData, 'utf8') //读取的字符串
		let userArr = JSON.parse(userStr) //解析成数组
		// 搜索匹配的对象 
		let uin = userArr.find(obj => obj.IP === IP)
		console.log(uin)
		if (typeof uin === 'object' && uin !== null) {
			return JSON.stringify({
				code: 200,
				msg: '查询成功',
				res: uin
			})
		} else {
			return JSON.stringify({
				code: 404,
				msg: '查询失败 - 用户不存在',
			})
		}

	} catch (e) {
		const timestamp = new Date().getTime()
		console.log(`${timestamp}  --findLz 出错：${e}`)
		return JSON.stringify({
			code: 500,
			msg: timestamp + '  --查询失败'
		})
	}
}

// 绑定上级
async function bindAbove(IP, aboveIP) {
	try {
		if (aboveIP === '') {
			return endFunction(401, '上级UID不能为空')
		} else if (aboveIP === IP) {
			return endFunction(402, '无法给自己助力')
		}

		const userData = './user/user.json'
		if (!fs.existsSync(userData)) {
			fs.writeFileSync(userData, '[]')
		}

		let userStr = fs.readFileSync(userData, 'utf8') //读取的字符串
		let userArr = JSON.parse(userStr) //解析成数组
		let uin = userArr.find(obj => obj.IP === IP)
		let above = uin.above //当前的上级地址，默认空

		let aboveUin = userArr.find(obj => obj.IP === aboveIP) //传入上级
		console.log(above)
		if (typeof aboveUin === 'object' && aboveUin !== null) {
			// console.log('上级ID 这个用户存在')
			if (above[0].user.length === 0) {
				above[0].user = aboveIP
				above[0].time = Date.now()
				fs.writeFileSync(userData, JSON.stringify(userArr)) //保存文件
				/*  绑定成功后，记录下级信息到aboveAddress的数据里面  */
				const underRes = await addUnderUser(aboveIP, IP) // 记录下级
				if(underRes.code === -1){
					return underRes
				}else{
					await sendLz(aboveIP) //给上级赠送领取次数
					return endFunction(200, '助力成功了')
				}
			} else {
				return endFunction(403, '你已经助力过')  //上级ID已经绑定
			}
		} else {
			return endFunction(404, '助力人不存在') //上级ID不存在
		}

		function endFunction(code, msg) {
			return JSON.stringify({
				code,
				msg
			})
		}
	} catch (e) {
		console.log(e)
		return JSON.stringify({
			code: 400,
			msg: 'bindAbove 校验出错',
			e
		})
	}
}

// 绑定下级用户  --内联函数 (上级用户的IP 下级用户的IP)
async function addUnderUser(IP, underIp) {
	try {
		const userData = './user/user.json'
		if (!fs.existsSync(userData)) {
			fs.writeFileSync(userData, '[]')
		}

		let userStr = fs.readFileSync(userData, 'utf8') //读取的字符串
		let userArr = JSON.parse(userStr) //解析成数组
		// 搜索匹配的对象 
		let uin = userArr.find(obj => obj.IP === IP)
		// console.log(uin)

		let uinUnder = uin.underUser
		let under = uinUnder.find(obj => obj.user === underIp) !== undefined
		console.log(under)
		if (under === true) {
			console.log(`${IP + ' 的下级中含有: ' + underIp + '本次不添加'}`)
			return JSON.stringify({
				code: -1,
				msg: '自己无法给自己助力',
			})
		} else {
			uinUnder.push({
				"user": underIp,
				"time": Date.now()
			})
		}

		fs.writeFileSync(userData, JSON.stringify(userArr)) //保存文件

		return JSON.stringify({
			code: 200,
			msg: '查询成功',
			res: uin.lz
		})
	} catch (e) {
		const timestamp = new Date().getTime()
		console.log(`${timestamp}  --addUnderUser 出错：${e}`)
		return JSON.stringify({
			code: 500,
			msg: timestamp + '  --查询失败'
		})
	}
}

// 给上级赠送领取机会 -- (上级的IP)
async function sendLz(IP) {
	try {
		const userData = './user/user.json'
		if (!fs.existsSync(userData)) {
			fs.writeFileSync(userData, '[]')
		}

		let userStr = fs.readFileSync(userData, 'utf8') //读取的字符串
		let userArr = JSON.parse(userStr) //解析成数组
		// 搜索匹配的对象 
		let uin = userArr.find(obj => obj.IP === IP)
		// console.log(uin)
		let lzOld = uin.lz + getLzNumber(uin)
		uin.lz = lzOld

		function getLzNumber(uin) {
			if (uin.underUser.length < 2) {
				// return Math.floor(Math.random() * 3) + 1;
				return 1
			} else {
				return 1
			}
		}
		console.log(uin)
		fs.writeFileSync(userData, JSON.stringify(userArr)) //保存文件
	} catch (e) {
		const timestamp = new Date().getTime()
		console.log(`${timestamp}  --sendLz 出错：${e}`)
		return JSON.stringify({
			code: 500,
			msg: timestamp + '  --查询失败'
		})
	}
}

// 减少领取机会  -- (传入值要减少的ID)  兑换奖励
async function cutLz(IP) {
	try {
		const userData = './user/user.json'
		if (!fs.existsSync(userData)) {
			fs.writeFileSync(userData, '[]')
		}

		let userStr = fs.readFileSync(userData, 'utf8') //读取的字符串
		let userArr = JSON.parse(userStr) //解析成数组
		// 搜索匹配的对象 
		let uin = userArr.find(obj => obj.IP === IP)
		// console.log(uin)
		let value = []
		let lzNew = uin.lz - 1
		let newGiftCode = ''

		if (lzNew < 0) {
			value = [500, '领取次数不足，无法领取CDKEY']
		} else {
			const giftCode = ['dzpd666666', 'dzpd88888888', 'eggyeggy666', 'dzpd66666666', 'dzpd88888888888', 'eggy0000',
				'EGGY0000', 'dzpd6666', 'vip666', 'vip888', 'vip999', 'svip666', 'svip888', 'svip999',
				'RT9UXSN44WOVLKYLW', 'R04BX1IHNQWZ0SEN1', 'EDKCUWL3OLDDLE5H', '17LBL65YQ2KU4H9T', 'K9NG1BHMDHOIEQNA',
				'SIWC9LBSZKMKCEVP', 'OYQHYSJLJAWX3FTX', '7J28NLQU6FP1T72D'
			]
			const randomIndex = Math.floor(Math.random() * giftCode.length)
			newGiftCode = giftCode[randomIndex]
			
			uin.lz = lzNew
			value = [200, '剩余领取次数: ' + lzNew + '\n你的礼包码: ' + newGiftCode, newGiftCode]
			console.log(uin)
			fs.writeFileSync(userData, JSON.stringify(userArr)) //保存文件
		}

		return JSON.stringify({
			code: value[0],
			msg: value[1],
			newGiftCode
		})
	} catch (e) {
		console.log(e)
		const timestamp = new Date().getTime()
		console.log(`${timestamp}  --cutLz 出错：${e}`)
		return JSON.stringify({
			code: 500,
			msg: timestamp + '  --查询失败'
		})
	}
}