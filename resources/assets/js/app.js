let prettyData = require('pretty-data').pd;
let moment = require('moment');

angular
    .module("app", [
        'ui.router',
        'hljs'
    ])
    .config(['$stateProvider', '$urlRouterProvider', '$urlMatcherFactoryProvider',
        function ($stateProvider, $urlRouterProvider, $urlMatcherFactoryProvider) {
            var GUID_REGEXP = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
            $urlMatcherFactoryProvider.type('guid', {
                encode: angular.identity,
                decode: angular.identity,
                is: function (item) {
                    return GUID_REGEXP.test(item);
                }
            });

            // States
            $urlRouterProvider.otherwise('/');

            $stateProvider
                .state('home', {
                    url: "/",
                    controller: 'AppController'
                })
                .state('request', {
                    url: "/{id:guid}/{offset:guid}/{page:int}",
                    controller: 'AppController'
                })
                .state('token', {
                    url: "/{id:guid}",
                    controller: 'AppController'
                })
                ;
        }
    ])
    .controller("AppController", ['$scope', '$http', '$stateParams', '$state', '$timeout', function ($scope, $http, $stateParams, $state, $timeout) {
        /**
         * Settings handling
         */

        // Array of scope variables to automatically save
        var settings = [
            'redirectEnable',
            'redirectUrl',
            'redirectContentType',
            'redirectHeaders',
            'redirectMethod',
            'token',
            'formatJsonEnable',
            'autoNavEnable',
            'hideTutorial',
        ];

        $scope.saveSettings = (function () {
            for (var setting in settings) {
                window.localStorage.setItem(
                    settings[setting],
                    JSON.stringify($scope[settings[setting]])
                );
            }
        });

        $scope.getSetting = (function (name, defaultValue) {
            var value = window.localStorage.getItem(name);

            if (!value || typeof (value) === 'undefined' || value === 'undefined') {
                if (typeof (defaultValue) === 'undefined') {
                    return null;
                }
                return defaultValue;
            }

            return JSON.parse(value);
        });

        /**
         * App Initialization
         */

        $scope.token = $scope.getSetting('token');
        $scope.requests = {
            total: 0,
            data: []
        };
        $scope.currentRequestIndex = 0;
        $scope.currentRequest = {};
        $scope.currentPage = 1;
        $scope.hasRequests = false;
        $scope.protocol = window.location.protocol;
        $scope.domain = window.location.host;
        $scope.appConfig = window.AppConfig;

        // Load settings
        $scope.formatJsonEnable = $scope.getSetting('formatJsonEnable', false);
        $scope.autoNavEnable = $scope.getSetting('autoNavEnable', false);
        $scope.redirectEnable = $scope.getSetting('redirectEnable', false);
        $scope.redirectMethod = $scope.getSetting('redirectMethod', '');
        $scope.redirectUrl = $scope.getSetting('redirectUrl', null);
        $scope.redirectContentType = $scope.getSetting('redirectContentType', 'text/plain');
        $scope.redirectHeaders = $scope.getSetting('redirectHeaders', null);
        $scope.unread = $scope.getSetting('unread', []);
        $scope.hideTutorial = $scope.getSetting('hideTutorial', false);

        // Initialize Clipboard copy button
        new Clipboard('.copyTokenUrl');

        // Initialize notify.js
        $.notifyDefaults({
            placement: {
                from: "bottom"
            },
            animate: {
                enter: "animated fadeInUp",
                exit: "animated fadeOutDown"
            },
            delay: 1000
        });

        // Hack to open modals inside that are nested inside divs
        // Since the modals need to be placed inside the ui-view div
        $('.openModal').click(function (e) {
            var modalId = $(this).data('modal');
            $(modalId).modal();
            $('.modal-backdrop').appendTo('.mainView');
            $('body').removeClass();
            
            // Reset form when opening new URL modal
            if (modalId === '#newUrlModal') {
                $scope.selectedTemplate = '';
                $('#createTokenForm')[0].reset();
                $('#default_status').val('');
                $('#default_content_type').val('');
                $('#default_content').val('');
                $('#timeout').val('0');
                $scope.$apply();
            }
            
            // Reset template selection when opening edit modal
            if (modalId === '#editUrlModal') {
                $scope.selectedEditTemplate = '';
                $scope.$apply();
            }
            
            // Reset template builder form when opening template builder modal
            if (modalId === '#templateBuilderModal') {
                $scope.cancelEditTemplate();
                $scope.$apply();
            }
        });

        // Automatically save settings
        $scope.$watchGroup(settings, function (newVal, oldVal) {
            if (newVal === oldVal) {
                return;
            }

            $scope.saveSettings();
        });

        /**
         * Tutorial
         */

        $scope.toggleTutorial = (function () {
            if ($scope.hideTutorial === true) {
                $scope.hideTutorial = false;
            } else {
                $scope.hideTutorial = true;
            }
        });

        /**
         * Unread Count
         */

        // Automatically update unread count in title tag
        $scope.$watchCollection('unread', function (newVal, oldVal) {
            if (newVal === oldVal) {
                return;
            }

            $scope.updateUnreadCount();
        });

        $scope.resetUnread = (function () {
            $scope.unread = [];
            $scope.updateUnreadCount();
        });

        $scope.updateUnreadCount = (function () {
            if ($scope.unread.length > 0) {
                document.title = '(' + $scope.unread.length + ') Tester';
            } else {
                document.title = 'Tester';
            }

            window.localStorage.setItem(
                'unread',
                JSON.stringify($scope.unread)
            );
        });

        $scope.markAsRead = (function (requestId) {
            if ($scope.unread.indexOf(requestId) !== -1) {
                $scope.unread.splice($scope.unread.indexOf(requestId), 1);
            }
        });

        $scope.updateUnreadCount();

        /**
         * Push
         */

        $scope.pushSubscribe = (function (token) {
            Echo.leave(token); // Make sure we're not subscribed twice.

            Echo.channel(token)
                .listen('.request.created', function (data) {
                    if (data.truncated) {
                        $scope.getRequest(data.request.token_id, data.request.uuid).then(function (response) {
                            $scope.appendRequest(response);
                        });
                    } else {
                        $scope.appendRequest(data.request);
                    }
                    $scope.requests.total = data.total;
                    $scope.$apply();
                });
        });

        /**
         * Controller actions
         */

        // Requests

        $scope.setCurrentRequest = (function (request) {
            $scope.currentRequestIndex = request.uuid;
            $scope.currentRequest = request;

            $scope.markAsRead(request.uuid);

            // Change the state url so it may be copied from address bar
            // and linked somewhere else
            $state.go('request', { id: $scope.token.uuid, offset: request.uuid, page: $scope.requests.current_page }, { notify: false });
        });

        $scope.deleteRequest = (function (request, requestIndex) {
            $http.delete('/token/' + request.token_id + '/request/' + request.uuid);

            // Remove from view
            $scope.requests.data.splice(requestIndex, 1);
            $scope.requests.total -= 1;
            $scope.markAsRead(request.uuid);
        });

        $scope.deleteAllRequests = (function (request) {
            $http.delete('/token/' + request.token_id + '/request');

            // Remove from view
            $scope.requests = {
                total: 0,
                is_last_page: true,
                data: []
            };
            $scope.currentRequestIndex = 0;
            $scope.currentRequest = {};
            $scope.currentPage = 1;
            $scope.hasRequests = false;
            $scope.resetUnread();
        });

        $scope.getRequest = (function (tokenId, requestId) {
            return $http.get('/token/' + tokenId + '/request/' + requestId)
                .then(function (response) {
                    return response.data;
                });
        });

        $scope.getRequests = (function (token, offset, page) {
            if (!page) {
                page = 1;
            }

            $http.get('/token/' + token + '/requests?page=' + page)
                .then(function (response) {
                    $scope.requests = response.data;

                    if (response.data.data.length > 0) {
                        $scope.hasRequests = true;

                        var activeRequest = 0;

                        for (var requestOffset in $scope.requests.data) {
                            if ($scope.requests.data[requestOffset].uuid == offset) {
                                activeRequest = requestOffset;
                            }
                        }

                        $scope.setCurrentRequest($scope.requests.data[activeRequest]);
                    } else {
                        $scope.hasRequests = false;
                    }
                }, function (response) {
                    $.notify('Requests not found - invalid ID');
                });
        });

        $scope.appendRequest = (function (request) {
            $scope.requests.data.push(request);
            $scope.unread.push(request.uuid);

            if ($scope.currentRequestIndex === 0) {
                $scope.setCurrentRequest($scope.requests.data[0]);
            }
            if ($scope.autoNavEnable) {
                if (!('hidden' in document) || !document.hidden) {
                    $scope.setCurrentRequest($scope.requests.data[$scope.requests.data.length - 1]);
                }
            }
            if ($scope.redirectEnable) {
                $scope.redirect(request, $scope.redirectUrl, $scope.redirectMethod, $scope.redirectContentType, $scope.redirectHeaders);
            }

            $scope.hasRequests = true;
            $scope.$apply();
            $.notify('Request received');
        });

        $scope.convertTypes = ['curl', 'HAR'];

        $scope.convertRequest = (function (request, as) {
            switch (as) {
                case 'curl':
                    let curl = `curl -X '${request.method}' '${request.url}'`;

                    // Headers
                    for (let header in request.headers) {
                        if (!request.headers.hasOwnProperty(header)) {
                            continue;
                        }
                        curl += ` -H '${header}: ${request.headers[header]}'`;
                    }

                    // Body
                    if (request.content !== null && request.content !== '') {
                        curl += ` -d $'${request.content}'`;
                    }

                    return curl;

                case 'HAR':
                    const headers2har = function(headers) {
                        let convHeaders = [];
                        for (let header in headers) {
                            if (!headers.hasOwnProperty(header)) {
                                continue;
                            }
                            convHeaders.push({
                                'name': header,
                                'value': headers[header][0]
                            });
                        }
                        return convHeaders;
                    };
                    return JSON.stringify({
                        'log': {
                            'version': '1.2',
                            'creator': {
                                'name': 'Tester',
                                'version': '1.0',
                            },
                            'entries': [{
                                // TODO: Add requests/responses from custom actions?
                                'startedDateTime': request.created_at,
                                'request': {
                                    'method': request.method,
                                    'url': request.url,
                                    'headers': headers2har(request.headers),
                                    'bodySize': !request.content ? 0 : request.content.length,
                                    'postData': {
                                        'mimeType': !request.headers['content-type']
                                            ? request.headers['content-type'][0]
                                            : 'application/json',
                                        'text': !request.content ? '' : request.content,
                                    }
                                },
                                'response': {
                                    'status': $scope.token.default_status,
                                    'httpVersion': 'HTTP/1.1',
                                    'headers': [
                                        {'name': 'Content-Type', 'value': $scope.token.default_content_type}
                                    ],
                                    'content': {
                                        'size': $scope.token.default_content.length,
                                        'text': $scope.token.default_content,
                                        'mimeType': $scope.token.default_content_type,
                                    }
                                }
                            }]
                        }
                    });

                default:
                    return 'Invalid format';
            }
        });

        $scope.copyRequestAs = (function (request, as) {
            const conv = $scope.convertRequest(request, as);
            copyToClipboard(conv);
            $.notify('Copied request as ' + as);
        });

        // Tokens

        $scope.getToken = (function (tokenId, offset, page) {
            if (!tokenId) {
                $http.post('token')
                    .then(function (response) {
                        $state.go('token', { id: response.data.uuid });
                    });
                $scope.resetUnread();
            } else {
                $http.get('token/' + tokenId)
                    .then(function (response) {
                        $scope.token = response.data;
                        $scope.getRequests(response.data.uuid, offset, page);
                        $scope.pushSubscribe(tokenId);
                        if (page) {
                            $scope.currentPage = page;
                        }
                    }, function (response) {
                        $scope.token = null;
                        $scope.getToken();
                        if (response.status === 404 || response.status === 410) {
                            $scope.token = null;
                            $scope.getToken();
                            $.notify('<b>URL not found</b><br>Invalid ID, created new URL', { delay: 10000 });
                        }
                    });
            }
        });

        // Default template responses (built-in)
        var defaultTemplates = {
            'json_success': {
                status: '200',
                contentType: 'application/json',
                content: '{"status": "success", "message": "Request received"}',
                builtIn: true
            },
            'json_error': {
                status: '400',
                contentType: 'application/json',
                content: '{"error": "Bad Request", "message": "Invalid request"}',
                builtIn: true
            },
            'json_created': {
                status: '201',
                contentType: 'application/json',
                content: '{"status": "created", "message": "Resource created successfully"}',
                builtIn: true
            },
            'json_not_found': {
                status: '404',
                contentType: 'application/json',
                content: '{"error": "Not Found", "message": "Resource not found"}',
                builtIn: true
            },
            'xml_response': {
                status: '200',
                contentType: 'application/xml',
                content: '<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  <status>success</status>\n  <message>Request received</message>\n</response>',
                builtIn: true
            },
            'plain_success': {
                status: '200',
                contentType: 'text/plain',
                content: 'OK',
                builtIn: true
            },
            'plain_error': {
                status: '500',
                contentType: 'text/plain',
                content: 'Internal Server Error',
                builtIn: true
            },
            'empty_response': {
                status: '204',
                contentType: 'text/plain',
                content: '',
                builtIn: true
            },
            'html_response': {
                status: '200',
                contentType: 'text/html',
                content: '<!DOCTYPE html>\n<html>\n<head><title>Success</title></head>\n<body><h1>Request Received</h1><p>Your request was successfully processed.</p></body>\n</html>',
                builtIn: true
            }
        };

        /**
         * Template management functions
         */
        var TEMPLATE_STORAGE_KEY = 'customResponseTemplates';

        var loadCustomTemplates = function() {
            var stored = $scope.getSetting(TEMPLATE_STORAGE_KEY, {});
            return stored || {};
        };

        var saveCustomTemplates = function(templates) {
            window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
        };

        var getAllTemplates = function() {
            var customTemplates = loadCustomTemplates();
            return angular.extend({}, defaultTemplates, customTemplates);
        };

        // Initialize response templates
        $scope.responseTemplates = getAllTemplates();
        $scope.customTemplates = loadCustomTemplates();

        /**
         * Template builder functions
         */
        $scope.templateBuilder = {
            editing: null,
            form: {
                name: '',
                status: '200',
                contentType: 'application/json',
                content: ''
            }
        };

        $scope.saveTemplate = function() {
            if (!$scope.templateBuilder.form.name || $scope.templateBuilder.form.name.trim() === '') {
                $.notify('Template name is required');
                return;
            }

            var templateKey;
            var customTemplates = loadCustomTemplates();
            
            if ($scope.templateBuilder.editing) {
                // Editing existing template - use existing key
                templateKey = $scope.templateBuilder.editing;
            } else {
                // Creating new template - generate key from name
                templateKey = $scope.templateBuilder.form.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                
                // Ensure key is not empty
                if (!templateKey || templateKey.trim() === '') {
                    $.notify('Invalid template name. Please use alphanumeric characters.');
                    return;
                }
                
                // Check if it's a built-in template
                if (defaultTemplates[templateKey]) {
                    $.notify('Cannot overwrite built-in templates. Please use a different name.');
                    return;
                }
                
                // Check if key already exists
                if (customTemplates[templateKey]) {
                    $.notify('A template with this name already exists. Please use a different name.');
                    return;
                }
            }

            customTemplates[templateKey] = {
                status: String($scope.templateBuilder.form.status || '200'),
                contentType: String($scope.templateBuilder.form.contentType || 'application/json'),
                content: String($scope.templateBuilder.form.content || ''),
                builtIn: false,
                name: String($scope.templateBuilder.form.name || templateKey)
            };

            try {
                saveCustomTemplates(customTemplates);
                
                // Force Angular to detect changes
                $scope.$apply(function() {
                    $scope.customTemplates = loadCustomTemplates();
                    $scope.responseTemplates = getAllTemplates();
                });
                
                $scope.templateBuilder.form = {
                    name: '',
                    status: '200',
                    contentType: 'application/json',
                    content: ''
                };
                $scope.templateBuilder.editing = null;
                
                $.notify('Template saved successfully!');
            } catch (e) {
                console.error('Error saving template:', e);
                $.notify('Error saving template: ' + e.message);
            }
        };

        $scope.editTemplate = function(templateKey) {
            var template = $scope.responseTemplates[templateKey];
            if (template && !template.builtIn) {
                $scope.templateBuilder.editing = templateKey;
                $scope.templateBuilder.form = {
                    name: template.name || templateKey,
                    status: template.status,
                    contentType: template.contentType,
                    content: template.content
                };
            }
        };

        $scope.deleteTemplate = function(templateKey) {
            if (defaultTemplates[templateKey]) {
                $.notify('Cannot delete built-in templates');
                return;
            }

            if (confirm('Are you sure you want to delete this template?')) {
                var customTemplates = loadCustomTemplates();
                delete customTemplates[templateKey];
                saveCustomTemplates(customTemplates);
                
                // Force Angular to detect changes
                $scope.$apply(function() {
                    $scope.customTemplates = loadCustomTemplates();
                    $scope.responseTemplates = getAllTemplates();
                });
                
                $.notify('Template deleted');
            }
        };

        $scope.cancelEditTemplate = function() {
            $scope.templateBuilder.form = {
                name: '',
                status: '200',
                contentType: 'application/json',
                content: ''
            };
            $scope.templateBuilder.editing = null;
        };

        /**
         * Migrate built-in templates to custom templates
         */
        $scope.migrateBuiltInTemplates = function() {
            if (!confirm('This will copy all built-in templates to your custom templates. You can then edit them. Continue?')) {
                return;
            }

            var customTemplates = loadCustomTemplates();
            var migrated = 0;
            var skipped = 0;

            Object.keys(defaultTemplates).forEach(function(key) {
                var template = defaultTemplates[key];
                
                // Only migrate if not already exists
                if (!customTemplates[key]) {
                    customTemplates[key] = {
                        status: template.status,
                        contentType: template.contentType,
                        content: template.content,
                        builtIn: false,
                        name: template.name || key.replace(/_/g, ' ').replace(/\b\w/g, function(l){return l.toUpperCase()})
                    };
                    migrated++;
                } else {
                    skipped++;
                }
            });

            saveCustomTemplates(customTemplates);
            
            // Force Angular to detect changes
            $scope.$apply(function() {
                $scope.customTemplates = loadCustomTemplates();
                $scope.responseTemplates = getAllTemplates();
            });

            var message = 'Migration complete! ' + migrated + ' template(s) migrated.';
            if (skipped > 0) {
                message += ' ' + skipped + ' template(s) already existed and were skipped.';
            }
            $.notify(message, { delay: 5000 });
        };

        /**
         * Migrate a single built-in template to custom
         */
        $scope.migrateSingleTemplate = function(templateKey) {
            if (!defaultTemplates[templateKey]) {
                $.notify('Template not found');
                return;
            }

            var customTemplates = loadCustomTemplates();
            
            if (customTemplates[templateKey]) {
                if (!confirm('A custom template with this name already exists. Overwrite it?')) {
                    return;
                }
            }

            var template = defaultTemplates[templateKey];
            customTemplates[templateKey] = {
                status: template.status,
                contentType: template.contentType,
                content: template.content,
                builtIn: false,
                name: template.name || templateKey.replace(/_/g, ' ').replace(/\b\w/g, function(l){return l.toUpperCase()})
            };

            saveCustomTemplates(customTemplates);
            
            // Force Angular to detect changes
            $scope.$apply(function() {
                $scope.customTemplates = loadCustomTemplates();
                $scope.responseTemplates = getAllTemplates();
            });
            
            $.notify('Template migrated successfully! You can now edit it.');
        };

        /**
         * Helper function to get form field by ID
         */
        var getFormField = function(fieldId) {
            return document.getElementById(fieldId);
        };

        /**
         * Helper function to set form field value and trigger events
         */
        var setFormFieldValue = function(fieldId, value) {
            var field = getFormField(fieldId);
            if (field) {
                field.value = value;
                $(field).trigger('change').trigger('input');
            }
        };

        /**
         * Helper function to clear form fields
         */
        var clearFormFields = function(fieldIds) {
            fieldIds.forEach(function(fieldId) {
                var field = getFormField(fieldId);
                if (field) {
                    field.value = '';
                }
            });
        };

        /**
         * Apply template values to create form fields
         */
        $scope.applyTemplate = function() {
            if (!$scope.selectedTemplate || $scope.selectedTemplate === '') {
                clearFormFields(['default_status', 'default_content_type', 'default_content']);
                return;
            }

            var template = $scope.responseTemplates[$scope.selectedTemplate];
            if (template) {
                $timeout(function() {
                    setFormFieldValue('default_status', template.status);
                    setFormFieldValue('default_content_type', template.contentType);
                    setFormFieldValue('default_content', template.content);
                }, 100);
            }
        };

        /**
         * Apply template values to edit form (uses Angular model binding)
         */
        $scope.applyEditTemplate = function() {
            if (!$scope.selectedEditTemplate || $scope.selectedEditTemplate === '') {
                return;
            }

            var template = $scope.responseTemplates[$scope.selectedEditTemplate];
            if (template && $scope.token) {
                $scope.token.default_status = template.status;
                $scope.token.default_content_type = template.contentType;
                $scope.token.default_content = template.content;
                $scope.$apply();
            }
        };

        /**
         * Helper function to get form field value
         */
        var getFormFieldValue = function(fieldId) {
            var field = getFormField(fieldId);
            return field && field.value ? field.value : null;
        };

        /**
         * Collect form data from create token form
         */
        $scope.getCustomToken = function() {
            var formData = {};
            
            // Get form values directly from DOM elements to ensure we capture template values
            var fieldMappings = {
                'default_status': 'default_status',
                'default_content_type': 'default_content_type',
                'default_content': 'default_content',
                'timeout': 'timeout',
                'expiry': 'expiry',
                'max_requests': 'max_requests'
            };
            
            Object.keys(fieldMappings).forEach(function(fieldId) {
                var value = getFormFieldValue(fieldId);
                if (value !== null && value !== '') {
                    formData[fieldMappings[fieldId]] = value;
                }
            });
            
            // Also use serializeArray as fallback for any other fields
            $('#createTokenForm')
                .serializeArray()
                .forEach(function (item) {
                    if (item.value !== '' && item.name !== 'response_template') {
                        formData[item.name] = item.value;
                    }
                });

            $http.post('token', formData)
                .then(function (response) {
                    $state.go('token', { id: response.data.uuid });
                    $scope.resetUnread();
                    $.notify('New URL created');
                })
                .catch(function (response) {
                    var errorMessage = 'Error creating token';
                    if (response.status === 422 && response.data) {
                        var errors = Object.keys(response.data).map(function(key) {
                            return Array.isArray(response.data[key]) 
                                ? response.data[key].join(', ')
                                : response.data[key];
                        });
                        errorMessage += ':<br>' + errors.join(', ');
                        $.notify(errorMessage, { delay: 10000 });
                    } else {
                        $.notify(errorMessage + ' (' + (response.status || 'unknown') + ')');
                    }
                });
        };

        /**
         * Update token with form data
         */
        $scope.editToken = function(tokenId) {
            var formData = {};

            $('#editTokenForm')
                .serializeArray()
                .forEach(function (item) {
                    if (item.value !== '') {
                        formData[item.name] = item.value;
                    }
                });

            $http.put('token/' + tokenId, formData)
                .then(function (response) {
                    $scope.token = response.data;
                    $.notify('URL updated!');
                })
                .catch(function (response) {
                    $.notify('Error updating token (' + response.status + ')');
                });
        };

        $scope.toggleCors = (function (token) {
            $http.put('token/' + token.uuid + '/cors/toggle')
                .then(function (response) {
                    if (response.status === 200) {
                        $scope.token.actions = response.data.enabled;
                        $scope.token.actions
                            ? $.notify('CORS enabled.')
                            : $.notify('CORS disabled.');

                    } else {
                        $.notify('Could not toggle CORS: ' + response.data.error.message);
                    }
                }).catch(function (response) {
                    $.notify('Could not toggle CORS: ' + response.data.error.message);
                });
        });

        // Pagination

        $scope.getPreviousPage = (function (token) {
            $http({
                url: '/token/' + token + '/requests',
                params: { page: $scope.requests.current_page - 1 }
            }).success(function (data, status, headers, config) {
                // We use is_last_page to keep track of whether we should load more pages.
                $scope.requests.is_last_page = data.is_last_page;
                $scope.requests.current_page = data.current_page;
                $scope.requests.data = data.data.concat($scope.requests.data);
            });
        });

        $scope.getNextPage = (function (token) {
            $http.get('/token/' + token + '/requests', {
                params: { page: $scope.requests.current_page + 1 }
            }).then(function (response) {
                // We use is_last_page to keep track of whether we should load more pages.
                $scope.requests.is_last_page = response.data.is_last_page;
                $scope.requests.current_page = response.data.current_page;
                $scope.currentPage = response.data.current_page;
                $scope.requests.data = $scope.requests.data.concat(response.data.data);
            });
        });

        $scope.goToNextRequest = (function () {
            $scope.setCurrentRequest(
                $scope.requests.data[$scope.requests.data.indexOf($scope.currentRequest) + 1]
            );

            if ($scope.requests.data.indexOf($scope.currentRequest) === $scope.requests.data.length - 1) {
                $scope.getNextPage($scope.token.uuid);
            }
        });

        $scope.parseUrl = (function (url) {
            var parser = document.createElement('a');
            parser.href = url;
            return parser;
        })

        $scope.redirect = (function (request, url, method, contentType, headers) {
            let parser = $scope.parseUrl(request.url);
            let headersList = [];
            let path = parser.pathname.match('\/[A-Za-z0-9-]+(/.*)');
            if (path === null) {
                path = '';
            } else {
                path = path[1];
            }

            if (headers !== null) {
                headersList = headers.split(",").filter(val => val !== "")
            }

            let headersDict = {
                'Content-Type': (!contentType ? 'text/plain' : contentType)
            }

            headersList.forEach(header => {
                if (header in request.headers) {
                    headersDict[header] = request.headers[header];
                }
            });


            var redirectUrl = url + path + parser.search;

            $http({
                'method': (!method ? request.method : method),
                'url': redirectUrl,
                'data': request.content,
                'headers': headersDict
            }).then(
                function ok(response) {
                    $.notify('Redirected request to ' + redirectUrl + '<br>Status: ' + response.statusText);
                },
                function error(response) {
                    $.notify(
                        'Error redirecting request to ' + redirectUrl + '<br>Status: ' + response.statusText,
                        {
                            delay: 5000,
                            type: 'danger'
                        }
                    );
                }
            );
        });

        $scope.getLabel = function (method) {
            switch (method) {
                case 'POST':
                    return 'info';
                case 'GET':
                    return 'success';
                case 'DELETE':
                    return 'danger';
                case 'HEAD':
                    return 'primary';
                case 'PATCH':
                    return 'warning';
                default:
                    return 'default';
            }
        };

        /**
         * JSON formatting
         */

        $scope.isValidJSON = function (text) {
            try {
                JSON.parse(text);
            } catch (e) {
                return false;
            }
            return true;
        };

        // Check if content-type indicates JSON
        $scope.isJsonContentType = function (request) {
            if (!request || !request.headers) {
                return false;
            }
            var contentType = '';
            if (request.headers['content-type'] && request.headers['content-type'].length > 0) {
                contentType = request.headers['content-type'][0].toLowerCase();
            }
            return contentType.indexOf('application/json') !== -1 || 
                   contentType.indexOf('application/vnd.api+json') !== -1 ||
                   contentType.indexOf('+json') !== -1;
        };

        // Get JSON validation error message
        $scope.getJsonValidationError = function (content) {
            if (!content || content === '') {
                return null;
            }
            try {
                JSON.parse(content);
                return null; // Valid JSON
            } catch (e) {
                return e.message || 'Invalid JSON';
            }
        };

        // Check if request has invalid JSON
        $scope.hasInvalidJson = function (request) {
            if (!request || !request.content) {
                return false;
            }
            return $scope.isJsonContentType(request) && !$scope.isValidJSON(request.content);
        };

        $scope.formatContentJson = function (content) {
            if (!content) {
                return '';
            }

            try {
                var json = JSONbig.parse(content);
                if (typeof json != 'string') {
                    json = JSONbig.stringify(json, undefined, 2);
                }
            } catch (e) {
                return content;
            }
            return json;
        };

        $scope.formatContent = function (content) {
            if (!content) {
                return '';
            }
            
            let hloutput = hljs.highlightAuto(content);

            if (hloutput.language === "json") {
                content = $scope.formatContentJson(content)
            }
            if (hloutput.language === "xml") {
                content = prettyData.xml(content);
            }

            return content;
        };

        $scope.localDate = (function (dateTimeString) {
            return moment.utc(dateTimeString).local().format('lll');
        });

        $scope.relativeDate = (function (dateTimeString) {
            return moment.utc(dateTimeString).fromNow();
        });

        // Initialize app. Check whether we need to load a token.
        if ($state.current.name) {
            if ($scope.getSetting('token') && !$stateParams.id) {
                $state.go('token', { id: $scope.getSetting('token').uuid });
            } else {
                $scope.getToken($stateParams.id, $stateParams.offset, $stateParams.page);
            }
        }
    }])
    .run(['$rootScope', '$state', '$stateParams',
        function ($rootScope, $state, $stateParams) {
            $rootScope.$state = $state;
            $rootScope.$stateParams = $stateParams;
        }]
    );
