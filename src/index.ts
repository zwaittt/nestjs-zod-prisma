import { generatorHandler } from '@prisma/generator-helper'
import { Project } from 'ts-morph'
import { SemicolonPreference } from 'typescript'
import type { PrismaOptions } from './config'
import { configSchema } from './config'
import {
  generateBarrelFile,
  generateEnumsFile,
  populateModelFile,
} from './generator'
import { formatName, lintText } from './util'

/* eslint-disable @typescript-eslint/no-var-requires */
const { version } = require('../package.json')

const defaultOutputPath = './src/zod'

generatorHandler({
  onManifest() {
    return {
      version,
      prettyName: 'NestJS Zod Schemas',
      defaultOutput: defaultOutputPath,
    }
  },
  async onGenerate(options) {
    const project = new Project()

    const models = options.dmmf.datamodel.models
    const enums = options.dmmf.datamodel.enums

    const { schemaPath } = options
    const outputPath = options.generator.output!.value!
    const clientPath = options.otherGenerators.find(
      each => each.provider.value === 'prisma-client-js',
    )!.output!.value!

    const results = configSchema.safeParse(options.generator.config)
    if (!results.success)
      throw new Error(
        'Incorrect config provided. Please check the values you provided and try again.',
      )

    const config = results.data
    const prismaOptions: PrismaOptions = {
      clientPath,
      outputPath,
      schemaPath,
    }

    const indexFile = project.createSourceFile(
      `${outputPath}/index.ts`,
      {},
      { overwrite: true },
    )

    generateBarrelFile(models, indexFile, name => formatName(name, config.modelCase))

    indexFile.formatText({
      indentSize: 2,
      convertTabsToSpaces: true,
      semicolons: SemicolonPreference.Remove,
    })

    const linted = await lintText(indexFile.getFullText(), `${outputPath}/index.ts`)

    indexFile.replaceWithText(linted)

    await models.map(model => {
      const filePath = `${outputPath}/${formatName(model.name, config.modelCase)}.ts`
      const sourceFile = project.createSourceFile(
        filePath,
        {},
        { overwrite: true },
      )

      populateModelFile(model, sourceFile, config, prismaOptions)

      sourceFile.formatText({
        indentSize: 2,
        convertTabsToSpaces: true,
        semicolons: SemicolonPreference.Remove,
      })
      return lintText(sourceFile.getFullText(), filePath).then(text => sourceFile.replaceWithText(text))
    })

    if (enums.length > 0) {
      const enumsFile = project.createSourceFile(
        `${outputPath}/enums.ts`,
        {},
        { overwrite: true },
      )

      generateEnumsFile(enums, enumsFile)

      enumsFile.formatText({
        indentSize: 2,
        convertTabsToSpaces: true,
        semicolons: SemicolonPreference.Remove,
      })
      await lintText(enumsFile.getFullText(), `${outputPath}/enums.ts`).then(text => enumsFile.replaceWithText(text))
    }

    return project.save()
  },
})
