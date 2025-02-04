import IError from "../../../shared/types/abstract/error"
import UserQuizQuestion from "../object/user-quiz-question"

import { GT } from "@/graphql/index"

// deprecated in favor of QuizCompletedMutation
const UserQuizQuestionUpdateCompletedPayload = GT.Object({
  name: "UserQuizQuestionUpdateCompletedPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    userQuizQuestion: {
      type: UserQuizQuestion,
    },
  }),
})

export default UserQuizQuestionUpdateCompletedPayload
