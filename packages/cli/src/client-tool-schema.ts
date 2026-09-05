import { z } from 'zod'

const STRICT_SCHEMA_TYPES = new Set<string>([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])
const STRICT_SCHEMA_FORMATS = new Set<string>([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
])
const STRICT_SCHEMA_KEYWORDS = new Set<string>([
  '$schema',
  'type',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'anyOf',
  '$defs',
  'definitions',
  '$ref',
  'enum',
  'const',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'multipleOf',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
])
const MAX_SCHEMA_DEPTH = 10
const MAX_SCHEMA_PROPERTIES = 5_000
const MAX_SCHEMA_STRING_LENGTH = 120_000
const MAX_SCHEMA_ENUM_VALUES = 1_000
const LARGE_STRING_ENUM_THRESHOLD = 250
const MAX_LARGE_STRING_ENUM_LENGTH = 15_000
const OPENAI_DRAFT_7_SCHEMA = 'http://json-schema.org/draft-07/schema#'

interface StrictSchemaValidationState {
  propertyCount: number
  stringLength: number
  enumValueCount: number
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value).every(isJsonValue)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function addSchemaIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  })
}

function matchesJsonSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case 'null':
      return value === null
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return isPlainObject(value)
    case 'array':
      return Array.isArray(value)
    default:
      return false
  }
}

function validateStrictSchemaNode(
  value: unknown,
  path: Array<string | number>,
  context: z.RefinementCtx,
  options: {
    root: boolean
    depth: number
    state: StrictSchemaValidationState
    requireAllProperties: boolean
  },
): void {
  if (options.depth > MAX_SCHEMA_DEPTH) {
    addSchemaIssue(context, path, `exceeds the maximum schema depth of ${MAX_SCHEMA_DEPTH}`)
    return
  }
  if (!isPlainObject(value)) {
    addSchemaIssue(context, path, 'must be a JSON Schema object')
    return
  }

  for (const keyword of Object.keys(value)) {
    if (!STRICT_SCHEMA_KEYWORDS.has(keyword)) {
      addSchemaIssue(
        context,
        [...path, keyword],
        `unsupported strict JSON Schema keyword: ${keyword}`,
      )
    }
  }

  if (value.description !== undefined && typeof value.description !== 'string') {
    addSchemaIssue(context, [...path, 'description'], 'must be a string')
  }
  if (
    value.$schema !== undefined
    && value.$schema !== OPENAI_DRAFT_7_SCHEMA
  ) {
    addSchemaIssue(
      context,
      [...path, '$schema'],
      `must be ${OPENAI_DRAFT_7_SCHEMA}`,
    )
  }

  let declaredTypes: string[] = []
  if (typeof value.type === 'string') {
    declaredTypes = [value.type]
    if (!STRICT_SCHEMA_TYPES.has(value.type)) {
      addSchemaIssue(context, [...path, 'type'], 'contains an unsupported type')
    }
  } else if (Array.isArray(value.type)) {
    declaredTypes = value.type.filter((item): item is string => typeof item === 'string')
    const uniqueTypes = new Set(declaredTypes)
    if (
      value.type.length !== 2
      || declaredTypes.length !== 2
      || uniqueTypes.size !== 2
      || !uniqueTypes.has('null')
      || declaredTypes.some((item) => !STRICT_SCHEMA_TYPES.has(item))
    ) {
      addSchemaIssue(
        context,
        [...path, 'type'],
        'nullable type must contain one supported type and "null"',
      )
    }
  } else if (value.type !== undefined) {
    addSchemaIssue(context, [...path, 'type'], 'must be a supported type or nullable type array')
  }

  const structuralForms = Number(value.type !== undefined)
    + Number(value.anyOf !== undefined)
    + Number(value.$ref !== undefined)
  if (structuralForms !== 1) {
    addSchemaIssue(
      context,
      path,
      'must define exactly one of type, anyOf, or $ref',
    )
  }

  if (options.root && value.type !== 'object') {
    addSchemaIssue(
      context,
      path,
      'function parameters must have type "object" at the root',
    )
  }

  const isObjectSchema = declaredTypes.includes('object')
  if (isObjectSchema) {
    if (!isPlainObject(value.properties)) {
      addSchemaIssue(context, [...path, 'properties'], 'is required and must be an object')
    } else {
      for (const [name, propertySchema] of Object.entries(value.properties)) {
        validateStrictSchemaNode(
          propertySchema,
          [...path, 'properties', name],
          context,
          {
            root: false,
            depth: options.depth + 1,
            state: options.state,
            requireAllProperties: options.requireAllProperties,
          },
        )
      }

      const propertyNames = Object.keys(value.properties)
      options.state.propertyCount += propertyNames.length
      options.state.stringLength += propertyNames.reduce(
        (total, name) => total + name.length,
        0,
      )
      if (options.state.propertyCount > MAX_SCHEMA_PROPERTIES) {
        addSchemaIssue(
          context,
          [...path, 'properties'],
          `exceeds the maximum of ${MAX_SCHEMA_PROPERTIES} properties per schema`,
        )
      }
      if (options.state.stringLength > MAX_SCHEMA_STRING_LENGTH) {
        addSchemaIssue(
          context,
          [...path, 'properties'],
          `exceeds the maximum schema string length of ${MAX_SCHEMA_STRING_LENGTH}`,
        )
      }
    }

    if (value.required === undefined && !options.requireAllProperties) {
      // Non-strict tools may omit required so object properties remain optional.
    } else if (
      !Array.isArray(value.required)
      || value.required.some((item) => typeof item !== 'string')
    ) {
      addSchemaIssue(
        context,
        [...path, 'required'],
        options.requireAllProperties
          ? 'is required and must be a string array'
          : 'must be a string array',
      )
    } else if (isPlainObject(value.properties)) {
      const propertyNames = Object.keys(value.properties)
      const requiredNames = value.required as string[]
      const hasDuplicates = new Set(requiredNames).size !== requiredNames.length
      const containsUnknownProperty = requiredNames.some(
        (name) => !propertyNames.includes(name),
      )
      const omitsProperty = options.requireAllProperties
        && propertyNames.some((name) => !requiredNames.includes(name))
      if (hasDuplicates || containsUnknownProperty || omitsProperty) {
        addSchemaIssue(
          context,
          [...path, 'required'],
          options.requireAllProperties
            ? 'must contain every property name exactly once'
            : 'must contain only property names, without duplicates',
        )
      }
    }

    if (value.additionalProperties !== false) {
      addSchemaIssue(context, [...path, 'additionalProperties'], 'is required and must be false')
    }
  } else {
    for (const keyword of ['properties', 'required', 'additionalProperties']) {
      if (value[keyword] !== undefined) {
        addSchemaIssue(context, [...path, keyword], 'is only supported on object schemas')
      }
    }
  }

  const isArraySchema = declaredTypes.includes('array')
  if (isArraySchema) {
    if (!isPlainObject(value.items)) {
      addSchemaIssue(context, [...path, 'items'], 'is required and must be a schema object')
    } else {
      validateStrictSchemaNode(value.items, [...path, 'items'], context, {
        root: false,
        depth: options.depth + 1,
        state: options.state,
        requireAllProperties: options.requireAllProperties,
      })
    }
  } else {
    for (const keyword of ['items', 'minItems', 'maxItems']) {
      if (value[keyword] !== undefined) {
        addSchemaIssue(context, [...path, keyword], 'is only supported on array schemas')
      }
    }
  }

  if (value.anyOf !== undefined) {
    if (!Array.isArray(value.anyOf) || value.anyOf.length === 0) {
      addSchemaIssue(context, [...path, 'anyOf'], 'must be a non-empty schema array')
    } else {
      for (const [index, branch] of value.anyOf.entries()) {
        validateStrictSchemaNode(branch, [...path, 'anyOf', index], context, {
          root: false,
          depth: options.depth + 1,
          state: options.state,
          requireAllProperties: options.requireAllProperties,
        })
      }
    }
  }

  for (const definitionsKeyword of ['$defs', 'definitions'] as const) {
    const definitions = value[definitionsKeyword]
    if (definitions === undefined) continue
    if (!isPlainObject(definitions)) {
      addSchemaIssue(
        context,
        [...path, definitionsKeyword],
        'must be an object of schemas',
      )
    } else {
      const definitionNames = Object.keys(definitions)
      options.state.stringLength += definitionNames.reduce(
        (total, name) => total + name.length,
        0,
      )
      if (options.state.stringLength > MAX_SCHEMA_STRING_LENGTH) {
        addSchemaIssue(
          context,
          [...path, definitionsKeyword],
          `exceeds the maximum schema string length of ${MAX_SCHEMA_STRING_LENGTH}`,
        )
      }
      for (const [name, schema] of Object.entries(definitions)) {
        validateStrictSchemaNode(schema, [...path, definitionsKeyword, name], context, {
          root: false,
          depth: options.depth + 1,
          state: options.state,
          requireAllProperties: options.requireAllProperties,
        })
      }
    }
  }

  if (
    value.$ref !== undefined
    && (
      typeof value.$ref !== 'string'
      || (
        value.$ref !== '#'
        && !value.$ref.startsWith('#/$defs/')
        && !value.$ref.startsWith('#/definitions/')
      )
    )
  ) {
    addSchemaIssue(
      context,
      [...path, '$ref'],
      'must reference #, a root $defs entry, or a root definitions entry',
    )
  }

  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length === 0) {
      addSchemaIssue(context, [...path, 'enum'], 'must be a non-empty JSON array')
    } else {
      options.state.enumValueCount += value.enum.length
      const encodedValues = value.enum.map((item) => JSON.stringify(item))
      if (new Set(encodedValues).size !== encodedValues.length) {
        addSchemaIssue(context, [...path, 'enum'], 'must contain unique values')
      }
      if (options.state.enumValueCount > MAX_SCHEMA_ENUM_VALUES) {
        addSchemaIssue(
          context,
          [...path, 'enum'],
          `exceeds the maximum of ${MAX_SCHEMA_ENUM_VALUES} enum values per schema`,
        )
      }
      const stringEnumLength = value.enum.reduce(
        (total, item) => total + (typeof item === 'string' ? item.length : 0),
        0,
      )
      options.state.stringLength += stringEnumLength
      if (
        value.enum.length > LARGE_STRING_ENUM_THRESHOLD
        && stringEnumLength > MAX_LARGE_STRING_ENUM_LENGTH
      ) {
        addSchemaIssue(
          context,
          [...path, 'enum'],
          `string values exceed ${MAX_LARGE_STRING_ENUM_LENGTH} characters`,
        )
      }
      for (const [index, item] of value.enum.entries()) {
        if (
          declaredTypes.length > 0
          && !declaredTypes.some((type) => matchesJsonSchemaType(item, type))
        ) {
          addSchemaIssue(
            context,
            [...path, 'enum', index],
            'does not match its declared type',
          )
        }
      }
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'const')
    && declaredTypes.length > 0
    && !declaredTypes.some((type) => matchesJsonSchemaType(value.const, type))
  ) {
    addSchemaIssue(context, [...path, 'const'], 'does not match its declared type')
  }
  if (typeof value.const === 'string') {
    options.state.stringLength += value.const.length
  }
  if (options.state.stringLength > MAX_SCHEMA_STRING_LENGTH) {
    addSchemaIssue(
      context,
      path,
      `exceeds the maximum schema string length of ${MAX_SCHEMA_STRING_LENGTH}`,
    )
  }

  const isStringSchema = declaredTypes.includes('string')
  for (const keyword of ['minLength', 'maxLength'] as const) {
    if (value[keyword] !== undefined) {
      if (!isStringSchema) {
        addSchemaIssue(context, [...path, keyword], 'is only supported on string schemas')
      } else if (
        typeof value[keyword] !== 'number'
        || !Number.isInteger(value[keyword])
        || value[keyword] < 0
      ) {
        addSchemaIssue(context, [...path, keyword], 'must be a non-negative integer')
      }
    }
  }
  if (value.pattern !== undefined) {
    if (!isStringSchema) {
      addSchemaIssue(context, [...path, 'pattern'], 'is only supported on string schemas')
    } else if (typeof value.pattern !== 'string') {
      addSchemaIssue(context, [...path, 'pattern'], 'must be a string')
    } else {
      try {
        new RegExp(value.pattern)
      } catch {
        addSchemaIssue(context, [...path, 'pattern'], 'must be a valid regular expression')
      }
    }
  }
  if (value.format !== undefined) {
    if (!isStringSchema) {
      addSchemaIssue(context, [...path, 'format'], 'is only supported on string schemas')
    } else if (
      typeof value.format !== 'string'
      || !STRICT_SCHEMA_FORMATS.has(value.format)
    ) {
      addSchemaIssue(context, [...path, 'format'], 'contains an unsupported string format')
    }
  }

  const isNumberSchema = declaredTypes.includes('number') || declaredTypes.includes('integer')
  for (const keyword of [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
  ] as const) {
    if (value[keyword] !== undefined) {
      if (!isNumberSchema) {
        addSchemaIssue(context, [...path, keyword], 'is only supported on number schemas')
      } else if (
        typeof value[keyword] !== 'number'
        || !Number.isFinite(value[keyword])
      ) {
        addSchemaIssue(context, [...path, keyword], 'must be a finite number')
      }
    }
  }
  if (value.multipleOf !== undefined) {
    if (!isNumberSchema) {
      addSchemaIssue(context, [...path, 'multipleOf'], 'is only supported on number schemas')
    } else if (
      typeof value.multipleOf !== 'number'
      || !Number.isFinite(value.multipleOf)
      || value.multipleOf <= 0
    ) {
      addSchemaIssue(context, [...path, 'multipleOf'], 'must be a positive finite number')
    }
  }

  for (const keyword of ['minItems', 'maxItems'] as const) {
    if (
      value[keyword] !== undefined
      && (
        typeof value[keyword] !== 'number'
        || !Number.isInteger(value[keyword])
        || value[keyword] < 0
      )
    ) {
      addSchemaIssue(context, [...path, keyword], 'must be a non-negative integer')
    }
  }
}

function createClientToolParametersSchema(requireAllProperties: boolean) {
  return z.record(z.unknown())
    .refine(isJsonValue, 'parameters must contain only JSON values')
    .superRefine((parameters, context) => {
      validateStrictSchemaNode(parameters, [], context, {
        root: true,
        depth: 1,
        state: {
          propertyCount: 0,
          stringLength: 0,
          enumValueCount: 0,
        },
        requireAllProperties,
      })
    })
}

export const StrictClientToolParametersSchema = createClientToolParametersSchema(true)
export const NonStrictClientToolParametersSchema = createClientToolParametersSchema(false)
