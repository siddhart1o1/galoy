import { applyMiddleware } from "graphql-middleware"
import { and, rule, shield } from "graphql-shield"
import { RuleAnd } from "graphql-shield/typings/rules"

import { NextFunction, Request, Response } from "express"

import DataLoader from "dataloader"

import { isAuthenticated, startApolloServer } from "./graphql-server"

import { baseLogger } from "@/services/logger"
import { setupMongoConnection } from "@/services/mongodb"

import { activateLndHealthCheck } from "@/services/lnd/health"

import { adminMutationFields, adminQueryFields, gqlAdminSchema } from "@/graphql/admin"

import { GALOY_ADMIN_PORT, UNSECURE_IP_FROM_REQUEST_OBJECT } from "@/config"

import {
  SemanticAttributes,
  addAttributesToCurrentSpanAndPropagate,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

import { parseIps } from "@/domain/accounts-ips"

import { Transactions } from "@/app"

import { AuthorizationError } from "@/graphql/error"

import { checkedToUserId } from "@/domain/accounts"

import { AccountsRepository } from "@/services/mongoose"

export const isEditor = rule({ cache: "contextual" })((
  parent,
  args,
  ctx: GraphQLAdminContext,
) => {
  return ctx.isEditor ? true : new AuthorizationError({ logger: baseLogger })
})

const graphqlLogger = baseLogger.child({ module: "graphql" })

const setGqlAdminContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const logger = baseLogger
  const tokenPayload = req.token

  // TODO: delete once migration to Oauth2 is completed
  const ipString = UNSECURE_IP_FROM_REQUEST_OBJECT
    ? req.ip
    : req.headers["x-real-ip"] || req.headers["x-forwarded-for"]

  let ip = parseIps(ipString)
  if (!ip) {
    logger.error("ip missing")
    ip = "127.0.0.1" as IpAddress // dummy ip
  }
  // end TODO

  // TODO: loaders probably not needed for the admin panel
  const loaders = {
    txnMetadata: new DataLoader(async (keys) => {
      const txnMetadata = await Transactions.getTransactionsMetadataByIds(
        keys as LedgerTransactionId[],
      )
      if (txnMetadata instanceof Error) {
        recordExceptionInCurrentSpan({
          error: txnMetadata,
          level: txnMetadata.level,
        })

        return keys.map(() => undefined)
      }

      return txnMetadata
    }),
  }

  // can be anon.
  // TODO: refactor to remove auth endpoint and make context always carry a uuid v4 .sub/UserId
  const auditorId = tokenPayload.sub as UserId

  let isEditor = false

  // TODO: should be using casbin instead of account
  if (auditorId !== "anon") {
    const emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/i
    const isEmail = auditorId.match(emailFormat)

    if (isEmail) {
      isEditor = true
    } else if (tokenPayload.scope?.includes("editor")) {
      isEditor = true
    } else {
      // TODO: remove branch once migration is completed to Oauth2
      const userId = checkedToUserId(auditorId)
      if (userId instanceof Error) return next(userId)

      const account = await AccountsRepository().findByUserId(userId)
      if (account instanceof Error) return next(account)
      isEditor = account.isEditor
    }
  }

  req.gqlContext = { ip, loaders, auditorId, logger, isEditor }

  addAttributesToCurrentSpanAndPropagate(
    {
      [SemanticAttributes.HTTP_CLIENT_IP]: ip,
      [SemanticAttributes.HTTP_USER_AGENT]: req.headers["user-agent"],
      [SemanticAttributes.ENDUSER_ID]: tokenPayload.sub,
    },
    next,
  )
}

export async function startApolloServerForAdminSchema() {
  const authedQueryFields: { [key: string]: RuleAnd } = {}
  for (const key of Object.keys(adminQueryFields.authed)) {
    authedQueryFields[key] = and(isAuthenticated, isEditor)
  }

  const authedMutationFields: { [key: string]: RuleAnd } = {}
  for (const key of Object.keys(adminMutationFields.authed)) {
    authedMutationFields[key] = and(isAuthenticated, isEditor)
  }

  const permissions = shield(
    {
      Query: authedQueryFields,
      Mutation: authedMutationFields,
    },
    {
      allowExternalErrors: true,
      fallbackError: new AuthorizationError({ logger: baseLogger }),
    },
  )

  const schema = applyMiddleware(gqlAdminSchema, permissions)
  return startApolloServer({
    schema,
    port: GALOY_ADMIN_PORT,
    type: "admin",
    setGqlContext: setGqlAdminContext,
  })
}

if (require.main === module) {
  setupMongoConnection()
    .then(async () => {
      activateLndHealthCheck()
      await startApolloServerForAdminSchema()
    })
    .catch((err) => graphqlLogger.error(err, "server error"))
}
