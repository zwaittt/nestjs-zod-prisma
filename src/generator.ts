import path from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import type {
  ImportDeclarationStructure,
  SourceFile,
} from 'ts-morph'
import {
  StructureKind,
  VariableDeclarationKind,
} from 'ts-morph'
import type { Config, PrismaOptions } from './config'
import { getJSDocs } from './docs'
import { getZodConstructor } from './types'
import { dotSlash, formatName, needsRelatedModel, useModelNames, writeArray } from './util'

export const writeImportsForModel = (
  model: DMMF.Model,
  sourceFile: SourceFile,
  config: Config,
  { schemaPath, outputPath }: PrismaOptions,
) => {
  const { relatedModelName } = useModelNames(config)

  const importList: ImportDeclarationStructure[] = [
    {
      kind: StructureKind.ImportDeclaration,
      namespaceImport: 'z',
      moduleSpecifier: 'nestjs-zod/z',
    },
  ]

  if (config.generateDto) {
    importList.push({
      kind: StructureKind.ImportDeclaration,
      namedImports: ['createZodDto'],
      moduleSpecifier: 'nestjs-zod/dto',
    })
  }

  if (config.imports) {
    importList.push({
      kind: StructureKind.ImportDeclaration,
      namespaceImport: 'imports',
      moduleSpecifier: dotSlash(
        path.relative(
          outputPath,
          path.resolve(path.dirname(schemaPath), config.imports),
        ),
      ),
    })
  }

  if (config.useDecimalJs && model.fields.some(f => f.type === 'Decimal')) {
    importList.push({
      kind: StructureKind.ImportDeclaration,
      namedImports: ['Decimal'],
      moduleSpecifier: 'decimal.js',
    })
  }

  const enumFields = model.fields.filter(f => f.kind === 'enum')
  const relationFields = model.fields.filter(f => f.kind === 'object')

  if (enumFields.length > 0) {
    importList.push({
      kind: StructureKind.ImportDeclaration,
      isTypeOnly: enumFields.length === 0,
      moduleSpecifier: dotSlash('enums'),
      namedImports: enumFields.map(f => f.type),
    })
  }

  if (config.relationModel !== false && relationFields.length > 0) {
    const filteredFields = relationFields.filter(f => f.type !== model.name)

    if (filteredFields.length > 0) {
      importList.push({
        kind: StructureKind.ImportDeclaration,
        moduleSpecifier: './index',
        namedImports: Array.from(
          new Set(
            filteredFields.flatMap(f => [
              `Complete${formatName(f.type, config.modelCase)}`,
              relatedModelName(f.type),
            ]),
          ),
        ),
      })
    }
  }

  sourceFile.addImportDeclarations(importList)
}

export const writeTypeSpecificSchemas = (
  model: DMMF.Model,
  sourceFile: SourceFile,
  config: Config,
  _prismaOptions: PrismaOptions,
) => {
  if (config.useDecimalJs && model.fields.some(f => f.type === 'Decimal')) {
    sourceFile.addStatements(writer => {
      writer.newLine()
      writeArray(writer, [
        '// Helper schema for Decimal fields',
        'z',
        '.instanceof(Decimal)',
        '.or(z.string())',
        '.or(z.number())',
        '.refine((value) => {',
        '  try {',
        '    return new Decimal(value);',
        '  } catch (error) {',
        '    return false;',
        '  }',
        '})',
        '.transform((value) => new Decimal(value));',
      ])
    })
  }
}

export const generateSchemaForModel = (
  model: DMMF.Model,
  sourceFile: SourceFile,
  config: Config,
  _prismaOptions: PrismaOptions,
) => {
  const { modelName } = useModelNames(config)

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    leadingTrivia: writer => writer.blankLineIfLastNot(),
    declarations: [
      {
        name: modelName(model.name),
        initializer(writer) {
          writer
            .write('z.object(')
            .inlineBlock(() => {
              model.fields
                .filter(f => f.kind !== 'object')
                .forEach(field => {
                  writeArray(writer, getJSDocs(field.documentation))
                  writer
                    .write(`${field.name}: ${getZodConstructor(field)}`)
                    .write(',')
                    .newLine()
                })
            })
            .write(')')
        },
      },
    ],
  })
}

export const generateDto = (
  model: DMMF.Model,
  sourceFile: SourceFile,
  config: Config,
) => {
  const { modelName, dtoName } = useModelNames(config)

  sourceFile.addClass({
    name: dtoName(model.name),
    isExported: true,
    leadingTrivia: writer => writer.blankLineIfLastNot(),
    extends: `createZodDto(${modelName(model.name)})`,
  })
}

export const generateRelatedSchemaForModel = (
  model: DMMF.Model,
  sourceFile: SourceFile,
  config: Config,
  _prismaOptions: PrismaOptions,
) => {
  const { modelName, relatedModelName } = useModelNames(config)

  const relationFields = model.fields.filter(f => f.kind === 'object')

  sourceFile.addInterface({
    name: `Complete${formatName(model.name, config.modelCase)}`,
    isExported: true,
    extends: [`z.infer<typeof ${modelName(model.name)}>`],
    properties: relationFields.map(f => ({
      hasQuestionToken: !f.isRequired,
      name: f.name,
      type: `Complete${formatName(f.type, config.modelCase)}${f.isList ? '[]' : ''}${
        !f.isRequired ? ' | null' : ''
      }`,
    })),
  })

  sourceFile.addStatements(writer =>
    writeArray(writer, [
      '',
      '/**',
      ` * ${relatedModelName(
        model.name,
      )} contains all relations on your model in addition to the scalars`,
      ' *',
      ' * NOTE: Lazy required in case of potential circular dependencies within schema',
      ' */',
    ]),
  )

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: relatedModelName(model.name),
        type: `z.ZodSchema<Complete${formatName(model.name, config.modelCase)}>`,
        initializer(writer) {
          writer
            .write(`z.lazy(() => ${modelName(model.name)}.extend(`)
            .inlineBlock(() => {
              relationFields.forEach(field => {
                writeArray(writer, getJSDocs(field.documentation))

                writer
                  .write(
                    `${field.name}: ${getZodConstructor(
                      field,
                      relatedModelName,
                    )}`,
                  )
                  .write(',')
                  .newLine()
              })
            })
            .write('))')
        },
      },
    ],
  })
}

export const populateModelFile = (
  model: DMMF.Model,
  sourceFile: SourceFile,
  config: Config,
  prismaOptions: PrismaOptions,
) => {
  writeImportsForModel(model, sourceFile, config, prismaOptions)
  writeTypeSpecificSchemas(model, sourceFile, config, prismaOptions)
  generateSchemaForModel(model, sourceFile, config, prismaOptions)
  if (config.generateDto)
    generateDto(model, sourceFile, config)
  if (needsRelatedModel(model, config))
    generateRelatedSchemaForModel(model, sourceFile, config, prismaOptions)
}

export const generateBarrelFile = (
  models: DMMF.Model[],
  indexFile: SourceFile,
  formatter = (name: string) => name,
) => {
  models.forEach(model =>
    indexFile.addExportDeclaration({
      moduleSpecifier: `./${formatter(model.name)}`,
    }),
  )
}

export const generateEnumsFile = (
  enums: DMMF.DatamodelEnum[],
  enumsFile: SourceFile,
) => {
  for (const { name, values } of enums) {
    const members = values.map(({ name: memberName }) => ({ name: memberName, value: memberName }))

    enumsFile
      .addEnum({
        name,
        members,
      })
      .setIsExported(true)
  }
}
