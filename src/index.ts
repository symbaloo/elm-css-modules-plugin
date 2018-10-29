import { PluginObj } from "@babel/core"
import {
  CallExpression,
  isIdentifier,
  ObjectExpression,
  StringLiteral,
  Identifier,
  ObjectProperty,
  objectProperty,
  memberExpression,
  callExpression,
  stringLiteral,
  identifier
} from "@babel/types"

type PluginOptions = {
  taggerName: string
}

/**
 * Corresponds to the default compiled output from the Elm package at
 * `cultureamp/elm-css-modules-loader`, allowing the plugin to be used directly
 * from babel-loader.
 */
const defaultPluginOptions: PluginOptions = {
  taggerName: "cultureamp$elm_css_modules_loader$CssModules$css"
}

/**
 * The shape of the CSS modules call expression generated by the Elm compiler.
 *
 * e.g. `A2(author$project$CssModules$css, "./Main.css", { xx: "someClass" });`
 */
type CssModuleExpressionArguments = [
  Identifier,
  StringLiteral,
  ObjectExpression
]

const makePlugin = (options: PluginOptions): PluginObj => {
  /** An append-only list of error descriptions. */
  const errors: string[] = []

  return {
    name: "elm-css-modules-plugin",

    post: () => {
      if (errors.length > 0) {
        // report errors and throw
        throw new Error(`elm-css-modules-plugin:\n\t` + errors.join("\n\t"))
      }
    },

    visitor: {
      CallExpression: ({ node }) => {
        if (!isCssModuleExpression(node, options.taggerName)) return

        const [
          taggerIdNode,
          filePathNode,
          classMapNode
        ] = node.arguments as CssModuleExpressionArguments

        classMapNode.properties = classMapNode.properties.map(
          makeClassMapPropertyTransform(filePathNode.value, errors)
        )
      }
    }
  }
}

/**
 * The shape of a pre-transformed elm-css-modules CSS module object property,
 *
 * e.g. `xx: "someClass"`
 */
interface ClassMapProperty extends ObjectProperty {
  key: Identifier
  value: StringLiteral
}

/**
 * Returns an error description for a classname node with an empty string value.
 */
const emptyClassnameError = (
  filePath: string,
  key: Identifier,
  classname: StringLiteral
): string => {
  const { line, column } = classname.loc.start
  const { name } = key
  return `classname for module '${filePath}' with key '${name}' contained an empty string (${line},${column})`
}

/**
 * Takes the path to a CSS file and returns a function which transforms
 * properties on the associated CSS modules map (as a POJO) output by the
 * Elm compiler into a member-accessed `require` expression for that CSS file.
 *
 * e.g. `xx: "someClass"` -> `xx: require("./Main.css")["someClass"]`
 */
const makeClassMapPropertyTransform = (filePath: string, errors: string[]) => {
  return ({ key, value: classname }: ClassMapProperty) => {
    if (classname.value === "") {
      errors.push(emptyClassnameError(filePath, key, classname))
    }
    return objectProperty(
      key,
      memberExpression(
        callExpression(identifier("require"), [stringLiteral(filePath)]),
        stringLiteral(classname.value),
        true // computed? (i.e. `object["property"]`)
      )
    )
  }
}

/**
 * Returns true if the call expression is a CSS module expression
 * produced by the Elm compiler via the Elm CSS modules package.
 */
const isCssModuleExpression = (
  expression: CallExpression,
  taggerIdName: string
) =>
  isIdentifier(expression.callee) &&
  expression.callee.name === "A2" &&
  isIdentifier(expression.arguments[0]) &&
  expression.arguments[0]["name"] === taggerIdName

export default makePlugin(defaultPluginOptions)

export { makePlugin as withOptions, defaultPluginOptions, PluginOptions }
