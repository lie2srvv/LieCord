package chat.stoat.screens.login

import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import chat.stoat.BuildConfig
import chat.stoat.R

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LoginGreetingScreen(navController: NavController) {
    val context = LocalContext.current
    var catTaps by remember { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(vertical = 20.dp, horizontal = 0.dp)
            .safeDrawingPadding(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .weight(1f),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier
                    .padding(bottom = 20.dp)
                    .combinedClickable(
                        interactionSource = remember(::MutableInteractionSource),
                        indication = null,
                        onClick = {
                            if (catTaps < 9) {
                                catTaps++
                            } else {
                                Toast
                                    .makeText(
                                        context,
                                        "⚡ LieCord",
                                        Toast.LENGTH_SHORT
                                    )
                                    .show()
                                catTaps = 0
                            }
                        }
                    )
            ) {
                Image(
                    painter = painterResource(id = R.drawable.liecord_logo),
                    contentDescription = "LieCord",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(64.dp)
                )

                Spacer(modifier = Modifier.width(14.dp))

                Text(
                    text = "LieCord",
                    style = MaterialTheme.typography.displayMedium.copy(
                        fontWeight = FontWeight.Black,
                        fontSize = 38.sp
                    )
                )
            }

            Text(
                text = stringResource(R.string.login_onboarding_heading),
                style = MaterialTheme.typography.displaySmall.copy(
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center
                ),
                modifier = Modifier
                    .padding(horizontal = 20.dp, vertical = 10.dp)
                    .fillMaxWidth()
            )

            Text(
                text = stringResource(R.string.login_onboarding_body),
                color = MaterialTheme.colorScheme.onBackground.copy(
                    alpha = 0.5f
                ),
                style = MaterialTheme.typography.titleMedium.copy(
                    fontSize = 16.sp,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.Normal
                ),
                modifier = Modifier
                    .padding(horizontal = 20.dp, vertical = 10.dp)
                    .fillMaxWidth()
            )
        }

        Column(
            modifier = Modifier
                .width(200.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Button(
                onClick = { navController.navigate("login/login") },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("view_login_page_button")
            ) {
                Text(text = stringResource(R.string.login))
            }

            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}
