import { GT } from "@/graphql/index"

import AccountDetailPayload from "@/graphql/admin/types/payload/account-detail"
import AccountStatus from "@/graphql/admin/types/scalar/account-status"
import { Accounts } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const AccountUpdateStatusInput = GT.Input({
  name: "AccountUpdateStatusInput",
  fields: () => ({
    uid: {
      type: GT.NonNullID,
    },
    status: {
      type: GT.NonNull(AccountStatus),
    },
    comment: {
      type: GT.String,
    },
  }),
})

const AccountUpdateStatusMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: { uid: string; status: AccountStatus | Error; comment: string }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(AccountDetailPayload),
  args: {
    input: { type: GT.NonNull(AccountUpdateStatusInput) },
  },
  resolve: async (_, args, { auditorId }) => {
    const { uid, status, comment } = args.input
    for (const input of [uid, status, comment]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    if (status instanceof Error) return { errors: [{ message: status.message }] }

    const account = await Accounts.updateAccountStatus({
      id: uid,
      status,
      updatedByUserId: auditorId,
      comment,
    })
    if (account instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(account)] }
    }
    return { errors: [], accountDetails: account }
  },
})

export default AccountUpdateStatusMutation
