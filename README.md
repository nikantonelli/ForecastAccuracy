PI Forecast Accuracy
=========================

## Overview

This app wil look for completed portfolio items of a particular type and then plot the percent accuracy of each item. You are aiming for those to be around 100% if you use the idea that total userstory points equals feature size. If you don't then your items should still cluster, but cluster around a different level. It is consistency you are looking for, so not a huge _range_ of sizes and durations.

![alt text](https://github.com/nikantonelli/ForecastAccuracy/blob/master/Images/Untitled.png)

There are some app settings:

![all text](https://github.com/nikantonelli/ForecastAccuracy/blob/master/Images/settings.png)

The MonteCarlo plot (lower section) will take all the items of type selected unless you want to specify a particular item size. Leave this at '--clear--' to select all sizes.

The MC Plot Date will rebase all the burndowns to start on that date. So, you can choose a date in the future when you might start work and then oyu can see when you might be finished by.

If you have thousands and thousands of items, you can limit the historical item fetch to up to 200 if you wish. The start and end dates specify when to look for an "ActualEndDate' for a portfolio item.

## License

ForcecastAccuracy is released under the MIT license.  See the file [LICENSE](./LICENSE) for the full text.

##Documentation for SDK

You can find the documentation on our help [site.](https://help.rallydev.com/apps/2.1/doc/)
