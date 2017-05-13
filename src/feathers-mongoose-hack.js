
import errors from 'feathers-errors'
import service from 'feathers-mongoose'
import errorHandler from 'feathers-mongoose/lib/error-handler'
import filter from 'feathers-query-filters'


service.Service.prototype._get = function (id, params = {}) {
    params.query = params.query || {}
    const _query = Object.assign({}, params.query)
    delete _query.$populate
    delete _query.$select
    _query[this.id] = id

    let modelQuery = this
      .Model
      .findOne(_query)

    // Handle $populate
    if (params.query.$populate) {
        modelQuery = modelQuery.populate(params.query.$populate)
    }

    // Handle $select
    if (params.query.$select && params.query.$select.length) {
        const fields = { [this.id]: 1 }

        for (const key of params.query.$select) {
            fields[key] = 1
        }

        modelQuery.select(fields)
    } else if (params.query.$select && typeof params.query.$select === 'object') {
        modelQuery.select(params.query.$select)
    }

    return modelQuery
    .lean(this.lean)
    .exec()
    .then((data) => {
        if (!data) {
            throw new errors.NotFound(`No record found for id '${ id }'`)
        }

        return data
    })
    .catch(errorHandler)
}

service.Service.prototype.count = function (params, getFilter = filter) {
    const { query } = getFilter(params.query || {})
    return this.Model
        .where(query)
        .count()
        .exec()
        .then((total) => {
            return Promise.resolve({
                total
            })
        })
}

service.Service.prototype.get = function (id, params) {
    return id === 'count' ? this.count(params) : this._get(id, params)
}
