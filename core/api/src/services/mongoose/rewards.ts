import { Account } from "./schema"

import { toObjectId } from "./utils"

import { RewardAlreadyPresentError, UnknownRepositoryError } from "@/domain/errors"

// FIXME: improve boundary
export const RewardsRepository = (accountId: AccountId) => {
  const add = async (quizQuestionId: QuizQuestionId) => {
    try {
      // by default, mongodb return the previous state before the update
      const oldState = await Account.findOneAndUpdate(
        { _id: toObjectId<AccountId>(accountId) },
        { $push: { earn: quizQuestionId } },
        // { upsert: true },
      )

      if (!oldState) {
        return new UnknownRepositoryError("account not found")
      }

      const rewardNotFound =
        oldState.earn.findIndex((item) => item === quizQuestionId) === -1

      return rewardNotFound || new RewardAlreadyPresentError()
    } catch (err) {
      return new UnknownRepositoryError("reward issue")
    }
  }

  return {
    add,
  }
}
