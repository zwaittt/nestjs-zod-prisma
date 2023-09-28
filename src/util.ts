import { DMMF } from '@prisma/generator-helper'
import camelCase from 'lodash.camelcase'
import startcase from 'lodash.startcase'
import type { CodeBlockWriter } from 'ts-morph'
import { CaseType, Config } from './config'

const pascalCase = (input: string) =>
  startcase(camelCase(input)).replace(/ /g, '')

export const formatName = (
  string: string,
  caseType: CaseType,
  suffix = '',
  prefix = ''
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
  newLine = true
) => array.forEach((line) => writer.write(line).conditionalNewLine(newLine))

export const useModelNames = ({
  modelCase,
  modelSuffix,
  dtoSuffix,
  dtoCase,
  relationModel,
}: Config) => {
  return {
    modelName: (name: string) =>
      formatName(
        name,
        modelCase,
        modelSuffix,
        relationModel === 'default' ? '_' : ''
      ),
    dtoName: (name: string) => formatName(name, dtoCase, dtoSuffix),
    relatedModelName: (
      name: string | DMMF.SchemaEnum | DMMF.OutputType | DMMF.SchemaArg
    ) =>
      formatName(
        relationModel === 'default'
          ? name.toString()
          : `Related${name.toString()}`,
        modelCase
      ),
  }
}

export const needsRelatedModel = (model: DMMF.Model, config: Config) =>
  model.fields.some((field) => field.kind === 'object') &&
  config.relationModel !== false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const chunk = <T extends any[]>(input: T, size: number): T[] => {
  return input.reduce((array, item, idx) => {
    return idx % size === 0
      ? [...array, [item]]
      : [...array.slice(0, -1), [...array.slice(-1)[0], item]]
  }, [])
}

export const dotSlash = (input: string) => {
  const converted = input
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/')
    .replace(/\/\/+/g, '/')

  if (converted.includes(`/node_modules/`))
    return converted.split(`/node_modules/`).slice(-1)[0]

  if (converted.startsWith(`../`)) return converted

  return './' + converted
}
