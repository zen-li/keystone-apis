
import keystone from 'keystone'

import _ from 'lodash'
import mongoose from 'mongoose'
import feathers from 'feathers'
import service from 'feathers-mongoose'
import rest from 'feathers-rest'
import hooks from 'feathers-hooks'
import bodyParser from 'body-parser'
import errorHandler from 'feathers-errors/handler'

import './feathers-mongoose-hack'


const regex = function (hook) {
    const query = hook.params.query
    // 多字段全文检索
    /*
        query._fulltext = {
            text: '', // 搜索的文本
            model: '' // 正则匹配的模式(暂未支持, 使用默认 ig)
        }
    */
    if (
        query._fulltext &&
        query._fulltext.text &&
        this.customExtended &&
        this.customExtended.fullTextFields
    ) {
        // const _query = []
        const reg = new RegExp(query._fulltext.text, 'ig')
        delete query._fulltext

        const _query = this.customExtended.fullTextFields.map((v) => {
            return {
                [v]: reg
            }
        })

        query.$and = [
            {
                $or: _query
            }
        ]
    }

    // 单一字段正则匹配
    for (const field of Object.keys(query)) {
        if (query[field].$search && field.indexOf('$') === -1) {
            query[field] = {
                $regex: new RegExp(query[field].$search)
            }
        }
    }

    hook.params.query = query
    return hook
}


const parsers = {
    date: {
        validate (key, val) {
            return val.indexOf('{Date} ') === 0
        },
        parse (key, val) {
            return new Date(val.substr('{Date} '.length))
        }
    },
    ObjectId: {
        validate (key, val) {
            return val.indexOf('{ObjectId} ') === 0
        },
        parse (key, val) {
            /* eslint-disable new-cap */
            return mongoose.Types.ObjectId(val.substr('{ObjectId} '.length))
            /* eslint-enable new-cap */
        }
    }
}

const reviver = function (key, val) {
    if (typeof val !== 'string') {
        return val
    }

    for (const name of Object.keys(parsers)) {
        const parser = parsers[name]
        if (parser.validate(key, val)) {
            return parser.parse(key, val)
        }
    }

    return val
}

const aggregate = async function (hook) {
    const query = hook.params.query

    if (query.$aggregation) {
        try {
            const condition = JSON.parse(query.$aggregation, reviver)
            hook.result = await this.Model.aggregate(condition)
            return hook
        } catch (err) {
            return Promise.reject(err)
        }
    }

    return hook
}


const foo = function ({
    fullTextFields = {}
} = {}) {
    const app = feathers()
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({
        extended: true
    }))

    app.configure(hooks())
    app.configure(rest((req, res) => {
        res.format({
            'application/json' () {
                res.send({
                    code: 200,
                    data: res.data
                })
            }
        })
    }))


    const models = keystone.mongoose.models

    for (const name of Object.keys(models)) {
        const path = `/${ models[name].collection.name }`
        const model = models[name]
        const srv = service({
            Model: model,
            paginate: {
                default: 10,
                max: 100
            }
        })
        app.use(path, srv)
    }

    if (_.isPlainObject(fullTextFields)) {
        for (const modelname of Object.keys(fullTextFields)) {
            if (_.isArray(fullTextFields[modelname]) && app.service(modelname)) {
                app.service(modelname).customExtended = {
                    fullTextFields: fullTextFields[modelname]
                }
            }
        }
    }

    for (const srvname of Object.keys(app.services)) {
        app.services[srvname].before({
            find: aggregate
        })

        app.services[srvname].before({
            find: regex
        })
    }


    app.use(errorHandler())

    return app
}


export default foo
