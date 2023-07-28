/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "loginFromPhoneAndCode"] }] */

import { toSats } from "@domain/bitcoin"
import { DisplayCurrency } from "@domain/fiat"

import { ApolloClient, NormalizedCacheObject } from "@apollo/client/core"

import { sleep } from "@utils"

import { gql } from "apollo-server-core"

import {
  createApolloClient,
  defaultStateConfig,
  defaultTestClientConfig,
  initializeTestingState,
  killServer,
  startServer,
} from "test/e2e/helpers"
import {
  bitcoindClient,
  clearAccountLocks,
  clearLimiters,
  fundWalletIdFromLightning,
  getDefaultWalletIdByTestUserRef,
  getPhoneAndCodeFromRef,
} from "test/helpers"
import { loginFromPhoneAndCode } from "test/e2e/helpers/account-creation"
import {
  MainQueryDocument,
  MainQueryQuery,
  UserLoginDocument,
  UserLoginMutation,
  MeDocument,
  MeQuery,
} from "test/e2e/generated"

let apolloClient: ApolloClient<NormalizedCacheObject>,
  disposeClient: () => void = () => null,
  walletId: WalletId,
  serverPid: PID,
  triggerPid: PID,
  serverWsPid: PID

const userRef = "K"
const { phone, code } = getPhoneAndCodeFromRef(userRef)

const otherRef = "A"
const { phone: phoneOther, code: codeOther } = getPhoneAndCodeFromRef(otherRef)

const satsAmount = toSats(50_000)

beforeAll(async () => {
  await initializeTestingState(defaultStateConfig())
  serverPid = await startServer("start-main-ci")
  triggerPid = await startServer("start-trigger-ci")
  serverWsPid = await startServer("start-ws-ci")
})

beforeEach(async () => {
  await clearLimiters()
  await clearAccountLocks()
})

afterAll(async () => {
  await bitcoindClient.unloadWallet({ walletName: "outside" })
  disposeClient()
  await killServer(serverPid)
  await killServer(triggerPid)
  await killServer(serverWsPid)

  await sleep(2000)
})

gql`
  mutation UserLogin($input: UserLoginInput!) {
    userLogin(input: $input) {
      errors {
        message
      }
      authToken
    }
  }

  query mainQuery($hasToken: Boolean!) {
    globals {
      ### deprecated
      nodesIds
      ###

      network
      feesInformation {
        deposit {
          minBankFee
          minBankFeeThreshold
          ratio
        }
      }
    }

    ### deprecated
    quizQuestions {
      id
      earnAmount
    }
    ###

    me @include(if: $hasToken) {
      id
      language
      username
      phone

      ### deprecated
      quizQuestions {
        question {
          id
          earnAmount
        }
        completed
      }
      ###

      defaultAccount {
        ... on ConsumerAccount {
          quiz {
            id
            amount
            completed
          }
        }
        id
        level
        defaultWalletId
        wallets {
          id
          balance
          walletCurrency
          transactions(first: 3) {
            ...TransactionList
          }
        }
      }
    }
    mobileVersions {
      platform
      currentSupported
      minSupported
    }
  }

  query me {
    me {
      defaultAccount {
        defaultWalletId
        level
        wallets {
          id
          walletCurrency
        }
      }
    }
  }

  fragment TransactionList on TransactionConnection {
    pageInfo {
      hasNextPage
    }
    edges {
      cursor
      node {
        __typename
        id
        status
        direction
        memo
        createdAt
        settlementAmount
        settlementFee
        settlementDisplayAmount
        settlementDisplayFee
        settlementDisplayCurrency
        settlementCurrency
        settlementPrice {
          base
          offset
        }
        initiationVia {
          __typename
          ... on InitiationViaIntraLedger {
            counterPartyWalletId
            counterPartyUsername
          }
          ... on InitiationViaLn {
            paymentHash
          }
          ... on InitiationViaOnChain {
            address
          }
        }
        settlementVia {
          __typename
          ... on SettlementViaIntraLedger {
            counterPartyWalletId
            counterPartyUsername
          }
          ... on SettlementViaLn {
            paymentSecret
          }
          ... on SettlementViaOnChain {
            transactionHash
          }
        }
      }
    }
  }
`

describe("setup", () => {
  it("create main user", async () => {
    await loginFromPhoneAndCode({ phone, code })
  })

  it("create other", async () => {
    await loginFromPhoneAndCode({ phone: phoneOther, code: codeOther })
  })

  it("fund user", async () => {
    walletId = await getDefaultWalletIdByTestUserRef(userRef)

    await fundWalletIdFromLightning({ walletId, amount: satsAmount })
    ;({ apolloClient, disposeClient } = createApolloClient(defaultTestClientConfig()))
    const input = { phone, code }
    const result = await apolloClient.mutate<UserLoginMutation>({
      mutation: UserLoginDocument,
      variables: { input },
    })

    // Create a new authenticated client
    disposeClient()
    const authToken = (result?.data?.userLogin.authToken as AuthToken) ?? undefined

    ;({ apolloClient, disposeClient } = createApolloClient(
      defaultTestClientConfig(authToken),
    ))
    const meResult = await apolloClient.query<MeQuery>({ query: MeDocument })
    expect(meResult?.data?.me?.defaultAccount.defaultWalletId).toBe(walletId)
  })
})

describe("graphql", () => {
  describe("main query", () => {
    it("returns valid data", async () => {
      const { errors, data } = await apolloClient.query<MainQueryQuery>({
        query: MainQueryDocument,
        variables: { hasToken: true },
      })
      expect(errors).toBeUndefined()

      expect(data.globals).toBeTruthy()
      expect(data.me).toBeTruthy()
      expect(data.mobileVersions).toBeTruthy()
      expect(data.quizQuestions).toBeTruthy()

      expect(data?.globals?.nodesIds).toEqual(
        expect.arrayContaining([expect.any(String)]),
      )
      expect(data.me).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          language: expect.any(String),
          phone: expect.stringContaining("+1"),
        }),
      )
      expect(data?.me?.defaultAccount).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          defaultWalletId: expect.any(String),
        }),
      )

      expect(data?.me?.defaultAccount.quiz).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            amount: expect.any(Number),
            completed: expect.any(Boolean),
          }),
        ]),
      )
      expect(data?.me?.defaultAccount.wallets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            balance: expect.any(Number),
            walletCurrency: expect.any(String),
            transactions: expect.objectContaining({
              edges: expect.arrayContaining([
                expect.objectContaining({
                  cursor: expect.any(String),
                  node: expect.objectContaining({
                    id: expect.any(String),
                    direction: expect.any(String),
                    status: expect.any(String),
                    settlementAmount: expect.any(Number),
                    settlementFee: expect.any(Number),
                    settlementDisplayAmount: expect.any(String),
                    settlementDisplayFee: expect.any(String),
                    settlementDisplayCurrency: DisplayCurrency.Usd,
                    createdAt: expect.any(Number),
                  }),
                }),
              ]),
              pageInfo: expect.any(Object),
            }),
          }),
        ]),
      )

      expect(data.mobileVersions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            currentSupported: expect.any(Number),
            minSupported: expect.any(Number),
            platform: expect.any(String),
          }),
        ]),
      )
      expect(data.quizQuestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            earnAmount: expect.any(Number),
          }),
        ]),
      )
    })
  })
})
