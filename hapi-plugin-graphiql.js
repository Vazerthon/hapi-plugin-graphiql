/*
**  hapi-plugin-graphiql -- HAPI plugin for GraphiQL integration
**  Copyright (c) 2016 Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*  built-in dependencies  */
var path     = require("path")

/*  external dependencies  */
var Promise  = require("bluebird")
var fs       = require("fs-promise")
var Boom     = require("boom")
var co       = require("co")
var nunjucks = require("nunjucks")

/*  internal dependencies  */
var Package  = require("./package.json")

/*  the HAPI plugin register function  */
var register = function (server, options, next) {
    /*  determine options  */
    options = Object.assign({}, {
        graphiqlGlobals: "",
        graphiqlURL: "/graphiql",
        graphqlFetchURL: "/graphql",
        graphqlFetchOpts:
            "{\n" +
            "    method: \"POST\",\n" +
            "    headers: {\n" +
            "        \"Content-Type\": \"application/json\",\n" +
            "        \"Accept\":       \"application/json\"\n" +
            "    },\n" +
            "    body: JSON.stringify(params),\n" +
            "    credentials: \"same-origin\"\n" +
            "}\n",
        loginFetchURL: "/login",
        loginFetchOpts:
            "{\n" +
            "    method: \"POST\",\n" +
            "    headers: {\n" +
            "        \"Content-Type\": \"application/json\"\n" +
            "    },\n" +
            "    body: JSON.stringify({\n" +
            "        username: username,\n" +
            "        password: password\n" +
            "    }),\n" +
            "    credentials: \"same-origin\"\n" +
            "}\n",
        loginFetchSuccess: "",
        loginFetchError: "",
        graphqlExample:
            "query Example {\n" +
            "    Session {\n" +
            "        __typename # schema introspection\n" +
            "    }\n" +
            "}\n"
    }, options)

    /*  convenience redirect  */
    server.route({
        method: "GET",
        path: options.graphiqlURL,
        handler: function (request, reply) {
            reply.redirect(options.graphiqlURL + "/")
        }
    })

    /*  static delivery of GraphiQL tool  */
    server.route({
        method: "GET",
        path: options.graphiqlURL + "/{name*}",
        handler: co.wrap(function * (request, reply) {
            var name = request.params.name
            var files, content
            var loadFiles = co.wrap(function * (files) {
                return (yield (Promise.map(files, co.wrap(function * (file) {
                    var m
                    var isTemplate = false
                    if ((m = file.match(/^%(.+)$/)) !== null) {
                        isTemplate = true
                        file = m[1]
                    }
                    if ((m = file.match(/^@([^\/]+)(\/.+)$/)) !== null)
                        file = require.resolve(m[1] + "/package.json").toString().replace(/\/package\.json$/, m[2])
                    else
                        file = path.join(__dirname, file)
                    var data = yield (fs.readFile(file, "utf8"))
                    if (isTemplate) {
                        var env = nunjucks.configure({ autoescape: false })
                        data = (new nunjucks.Template(data, env)).render({
                            graphiqlGlobals:  options.graphiqlGlobals,
                            graphqlFetchURL:  options.graphqlFetchURL,
                            graphqlFetchOpts: options.graphqlFetchOpts,
                            loginFetchURL:    options.loginFetchURL,
                            loginFetchOpts:   options.loginFetchOpts,
                            graphqlExample:   JSON.stringify(options.graphqlExample)
                        })
                    }
                    return data
                })))).join("")
            })
            if (name === undefined || name === "" || name === "graphiql.html") {
                /*  deliver HTML  */
                files = [
                    "graphiql.html"
                ]
                content = yield (loadFiles(files))
                return reply(content).type("text/html")
            }
            else if (name === "graphiql.js") {
                /*  deliver JS  */
                files = [
                    "@jquery/dist/jquery.min.js",
                    "@whatwg-fetch/fetch.js",
                    "@react/dist/react.min.js",
                    "@react-dom/dist/react-dom.min.js",
                    "@graphiql/graphiql.min.js",
                    "%graphiql.js"
                ]
                content = yield (loadFiles(files))
                return reply(content).type("text/javascript")
            }
            else if (name === "graphiql.css") {
                /*  deliver CSS  */
                files = [
                    "@graphiql/graphiql.css",
                    "graphiql.css"
                ]
                content = yield (loadFiles(files))
                return reply(content).type("text/css")
            }
            else
                return reply(Boom.badRequest("invalid path"))
        })
    })

    /*  continue processing  */
    next()
}

/*  provide meta-information as expected by HAPI  */
register.attributes = { pkg: Package }

/*  export register function, wrapped in a plugin object  */
module.exports = { register: register }
