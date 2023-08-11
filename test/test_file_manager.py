"""Test file manager.
"""

from unittest import TestCase
import logging
import os
import file_manager
import logs

class TestFileManager(TestCase):
    logger: logging.Logger

    RES_DIR = 'test/resources'
    TARGET_DIR = os.path.join(RES_DIR, 'target')

    def setUpClass():
        logs.init_logging(logs_dir=os.path.join(TestFileManager.RES_DIR, 'logs'))
        TestFileManager.logger = logging.getLogger(TestFileManager.__name__)
        TestFileManager.logger.setLevel(logging.DEBUG)
    # end def

    def test_file_name_to_id(self):
        prev_dir = os.getcwd()
        os.chdir(self.TARGET_DIR)
        self.logger.debug(f'test target dir = {os.getcwd()}')

        # original
        id_1 = file_manager.file_name_to_id('one-two three_four (1).xyz')
        # full copy
        id_2 = file_manager.file_name_to_id('one-two three_four (2).xyz')
        # different content
        id_3 = file_manager.file_name_to_id('one-two three_four (3).xyz')
        # different name
        id_4 = file_manager.file_name_to_id('one-two three four (4).xyz')
        # different extension
        id_5 = file_manager.file_name_to_id('one-two three_four (5).abc')

        self.assertEqual(id_1, id_2, f'failed to identify {id_2} as clone of {id_1}')
        self.assertNotEqual(id_1, id_3, f'failed to distinguish {id_3} by file contents')
        self.assertNotEqual(id_1, id_4, f'failed to distinguish {id_4} by file name')
        self.assertNotEqual(id_1, id_5, f'failed to distinguish {id_5} by file extension')

        os.chdir(prev_dir)
    # end def
# end class