/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPickSeparator, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { matchesFuzzy } from 'vs/base/common/filters';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ITaskService, Task } from 'vs/workbench/contrib/tasks/common/taskService';
import { CustomTask, ContributedTask, ConfiguringTask } from 'vs/workbench/contrib/tasks/common/tasks';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TaskQuickPick, TaskTwoLevelQuickPickEntry } from 'vs/workbench/contrib/tasks/browser/taskQuickPick';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isString } from 'vs/base/common/types';

export class TasksQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'task ';

	private activationPromise: Promise<void>;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@ITaskService private taskService: ITaskService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IQuickInputService private quickInputService: IQuickInputService
	) {
		super(TasksQuickAccessProvider.PREFIX);

		this.activationPromise = extensionService.activateByEvent('onCommand:workbench.action.tasks.runTask');
	}

	protected async getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {
		// always await extensions
		await this.activationPromise;

		if (token.isCancellationRequested) {
			return [];
		}

		const taskQuickPick = new TaskQuickPick(this.taskService, this.configurationService, this.quickInputService);
		const topLevelPicks = await taskQuickPick.getTopLevelEntries();
		const taskPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		for (const entry of topLevelPicks.entries) {
			if (entry.type === 'separator') {
				taskPicks.push(entry);
			}
			const highlights = matchesFuzzy(filter, entry.label!, true);
			if (!highlights) {
				continue;
			}
			const task: Task | ConfiguringTask | string = (<TaskTwoLevelQuickPickEntry>entry).task!;
			const quickAccessEntry: IPickerQuickAccessItem = <TaskTwoLevelQuickPickEntry>entry;
			quickAccessEntry.ariaLabel = localize('entryAriaLabel', "{0}, tasks picker", entry.label!);
			quickAccessEntry.highlights = { label: highlights };
			quickAccessEntry.trigger = () => {
				if (ContributedTask.is(task)) {
					this.taskService.customize(task, undefined, true);
				} else if (CustomTask.is(task)) {
					this.taskService.openConfig(task);
				}
				return TriggerAction.CLOSE_PICKER;
			};
			quickAccessEntry.accept = async () => {
				if (isString(task)) {
					// switch to quick pick and show second level
					taskQuickPick.show(localize('TaskService.pickRunTask', 'Select the task to run'), undefined, task);
				} else {
					this.taskService.run(await this.toTask(task), { attachProblemMatcher: true });
				}
			};

			taskPicks.push(quickAccessEntry);
		}
		return taskPicks;
	}

	private async toTask(task: Task | ConfiguringTask): Promise<Task | undefined> {
		if (!ConfiguringTask.is(task)) {
			return task;
		}

		return this.taskService.tryResolveTask(task);
	}
}
