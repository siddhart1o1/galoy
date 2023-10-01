// Copyright © 2023 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import urljoin from "url-join"
import csrf from "csurf"
import { hydraClient } from "../config"

// Sets up csrf protection
const csrfProtection = csrf({ cookie: true })
const router = express.Router()

router.get("/", csrfProtection, async (req, res, next) => {
  // Parses the URL query
  const query = url.parse(req.url, true).query

  // The challenge is used to fetch information about the logout request from ORY Hydra.
  const challenge = String(query.logout_challenge)
  if (!challenge) {
    next(new Error("Expected a logout challenge to be set but received none."))
    return
  }

  try {
    const response = await hydraClient.getOAuth2LogoutRequest({
      logoutChallenge: challenge,
    })
    // This will be called if the HTTP request was successful

    // Here we have access to e.g. response.subject, response.sid, ...

    // The most secure way to perform a logout request is by asking the user if he/she really want to log out.
    res.render("logout", {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      action: urljoin(process.env.BASE_URL || "", "/logout"),
    })
  } catch (err) {
    next(err)
    // This will handle any error that happens when making HTTP calls to hydra
  }
})

router.post("/", csrfProtection, async (req, res, next) => {
  // The challenge is now a hidden input field, so let's take it from the request body instead
  const challenge = req.body.challenge

  if (req.body.submit === "No") {
    try {
      const response = await hydraClient.rejectOAuth2LogoutRequest({
        logoutChallenge: challenge,
      })
      // The user did not want to log out. Let's redirect him back somewhere or do something else.
      res.redirect("https://www.blink.sh/")
    } catch (err) {
      next(err)
    }
  }

  try {
    // The user agreed to log out, let's accept the logout request.
    const response = await hydraClient.acceptOAuth2LogoutRequest({
      logoutChallenge: challenge,
    })

    // All we need to do now is to redirect the user back to hydra!
    res.redirect(String(response.data.redirect_to))
  } catch (err) {
    next(err)
  }
})

export default router