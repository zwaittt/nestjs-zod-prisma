import type { DMMF } from '@prisma/generator-helper'
import camelCase from 'lodash.camelcase'
import startcase from 'lodash.startcase'
import type { CodeBlockWriter } from 'ts-morph'
import type { ESLint } from 'eslint'
import type { CaseType, Config } from './config'

const pascalCase = (input: string) =>
  startcase(camelCase(input)).replace(/ /g, '')

export const formatName = (
  string: string,
  caseType: CaseType,
  suffix = '',
  prefix = '',
) => {
  switch (caseType) {
    case 'PascalCase':
      return `${prefix}${pascalCase(string)}${suffix}`
    case 'camelCase':
      return `${prefix}${camelCase(string)}${suffix}`
    default:
      return `${prefix}${string}${suffix}`
  }
}

export const writeArray = (
  writer: CodeBlockWriter,
  array: string[],
  newLine = true,
) => array.forEach(line => writer.write(line).conditionalNewLine(newLine))

export const useModelNames = ({
  modelCase,
  modelSuffix,
  dtoSuffix,
  dtoCase,
  relationModel,
}: Config) => ({
  modelName: (name: string) =>
    formatName(
      name,
      modelCase,
      modelSuffix,
      relationModel === 'default' ? '_' : '',
    ),
  dtoName: (name: string) => formatName(name, dtoCase, dtoSuffix),
  relatedModelName: (
    name: string | DMMF.SchemaEnum | DMMF.OutputType | DMMF.SchemaArg,
  ) =>
    formatName(
      relationModel === 'default'
        ? name.toString()
        : `Related${name.toString()}`,
      modelCase,
    ),
})

export const needsRelatedModel = (model: DMMF.Model, config: Config) =>
  model.fields.some(field => field.kind === 'object')
  && config.relationModel !== false

 
export const chunk = <T extends any[]>(input: T, size: number): T[] => input.reduce((array, item, idx) => idx % size === 0
  ? [...array, [item]]
  : [...array.slice(0, -1), [...array.slice(-1)[0], item]], [])

export const dotSlash = (input: string) => {
  const converted = input
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/')
    .replace(/\/\/+/g, '/')

  if (converted.includes('/node_modules/'))
    return converted.split('/node_modules/').slice(-1)[0]

  if (converted.startsWith('../'))
    return converted

  return `./${converted}`
}

let eslint: ESLint | null

export async function lintText(text: string, path?: string) {
  if (eslint === undefined) {
    try {
      const { ESLint } = await import('eslint')
      eslint = new ESLint({
        cwd: process.cwd(),
        fix: true,
        ignore: true,
        baseConfig: {
        },
      })
      await eslint.calculateConfigForFile(path || `${process.cwd()}/index.ts`)
    } catch (e) {
      // eslint not installed or configuration error indicated in the current project.
      eslint = null
      return text
    }
  }
  if (eslint === null) {
    return text
  }
  const res = await eslint.lintText(text, {
    filePath: path,
  })
  return res[0].output as string || text
}
